import { createClient } from "@/lib/supabase/server"

// ============================================================================
// Configuration types
// ============================================================================

export type GenerateConfig = {
  tienda_id: string
  categoria_id: string        // categoría raíz
  n_bandejas: number          // default 5
  n_posiciones: number        // default 20
  optimizar_por: "gmroi" | "margen" | "unidades"
  agrupacion: "marca" | "subfamilia" | "ninguna"
  eye_level_bandejas: number[] // default [2,3]
  incluir_sku_c: boolean       // incluir SKUs de baja rotación (gmroi < 0.5)
  sku_ids?: string[]           // si se especifican, usar solo estos SKUs
}

export type GeneratedSlot = {
  bandeja: number
  posicion: number
  sku_id: string
}

// ============================================================================
// Internal types for the algorithm
// ============================================================================

type SkuConKpis = {
  sku_id: string
  nombre: string
  marca_nombre: string | null
  subfamilia_nombre: string | null
  avg_gmroi: number | null
  avg_margen_pct: number | null
  total_unidades: number | null
  imagen_url: string | null
}

type RankedSku = SkuConKpis & {
  rank_score: number
  grupo_key: string | null
}

// ============================================================================
// Main export
// ============================================================================

export async function generarPlanograma(
  config: GenerateConfig
): Promise<GeneratedSlot[]> {
  const {
    tienda_id,
    categoria_id,
    n_bandejas,
    n_posiciones,
    optimizar_por,
    agrupacion,
    eye_level_bandejas,
    incluir_sku_c,
    sku_ids,
  } = config

  const sb = await createClient()

  // ── Step 1: load SKUs with KPIs via RPC ────────────────────────────────────
  const { data: skusRaw, error } = await (sb.rpc as any)(
    "get_skus_para_generar",
    {
      p_categoria_id: categoria_id,
      p_tienda_id: tienda_id,
      p_meses: 3,
    }
  )

  if (error) {
    throw new Error(`get_skus_para_generar failed: ${error.message}`)
  }

  let skus: SkuConKpis[] = (skusRaw ?? []) as SkuConKpis[]

  // ── Step 2: optional manual SKU filter ────────────────────────────────────
  if (sku_ids && sku_ids.length > 0) {
    const allowed = new Set(sku_ids)
    skus = skus.filter((s) => allowed.has(s.sku_id))
  }

  // ── Step 3: filter tier-C SKUs (gmroi < 0.5) when not included ────────────
  if (!incluir_sku_c) {
    skus = skus.filter((s) => s.avg_gmroi !== null && s.avg_gmroi >= 0.5)
  }

  if (skus.length === 0) {
    return []
  }

  // ── Step 4: rank by optimization criterion ────────────────────────────────
  const ranked: RankedSku[] = skus.map((s) => {
    let rank_score: number

    switch (optimizar_por) {
      case "gmroi":
        rank_score = s.avg_gmroi ?? -Infinity
        break
      case "margen":
        rank_score = s.avg_margen_pct ?? -Infinity
        break
      case "unidades":
        rank_score = s.total_unidades ?? -Infinity
        break
    }

    // Determine grouping key
    let grupo_key: string | null = null
    if (agrupacion === "marca") {
      grupo_key = s.marca_nombre ?? "__sin_marca__"
    } else if (agrupacion === "subfamilia") {
      grupo_key = s.subfamilia_nombre ?? "__sin_subfamilia__"
    }

    return { ...s, rank_score, grupo_key }
  })

  // Sort descending by rank score (higher is better)
  ranked.sort((a, b) => b.rank_score - a.rank_score)

  // ── Step 5: apply grouping (keep intra-group rank order) ──────────────────
  let orderedSkus: RankedSku[]

  if (agrupacion !== "ninguna") {
    // Preserve rank of the best SKU per group, then order groups by their
    // best-SKU rank; within each group maintain the original descending rank.
    const groupOrder = new Map<string, number>() // grupo_key → position of first appearance
    for (const s of ranked) {
      const key = s.grupo_key ?? "__none__"
      if (!groupOrder.has(key)) {
        groupOrder.set(key, groupOrder.size)
      }
    }

    orderedSkus = [...ranked].sort((a, b) => {
      const ga = groupOrder.get(a.grupo_key ?? "__none__")!
      const gb = groupOrder.get(b.grupo_key ?? "__none__")!
      if (ga !== gb) return ga - gb           // sort by group rank first
      return b.rank_score - a.rank_score       // then by individual rank
    })
  } else {
    orderedSkus = ranked
  }

  // ── Step 6: assign positions ───────────────────────────────────────────────
  const totalPositions = n_bandejas * n_posiciones

  // Build ordered list of (bandeja, posicion) pairs.
  // Eye-level bandejas come first; remaining bandejas fill the rest.
  // Within each bandeja: positions 1..n_posiciones left-to-right.
  const eyeLevelSet = new Set(eye_level_bandejas)

  // Validate eye-level bandejas are within range (clamp silently)
  const validEyeLevel = eye_level_bandejas
    .filter((b) => b >= 1 && b <= n_bandejas)
    .sort((a, b) => a - b)

  const otherBandejas = Array.from(
    { length: n_bandejas },
    (_, i) => i + 1
  ).filter((b) => !eyeLevelSet.has(b))

  const positionQueue: Array<{ bandeja: number; posicion: number }> = []

  for (const bandeja of [...validEyeLevel, ...otherBandejas]) {
    for (let posicion = 1; posicion <= n_posiciones; posicion++) {
      positionQueue.push({ bandeja, posicion })
    }
  }

  // Truncate SKUs if there are more than available positions
  const skusToPlace = orderedSkus.slice(0, totalPositions)

  // Build result — only emit slots where we have a SKU
  const slots: GeneratedSlot[] = skusToPlace.map((sku, idx) => ({
    bandeja: positionQueue[idx].bandeja,
    posicion: positionQueue[idx].posicion,
    sku_id: sku.sku_id,
  }))

  return slots
}
