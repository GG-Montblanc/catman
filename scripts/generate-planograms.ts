/**
 * scripts/generate-planograms.ts
 *
 * Crea planogramas demo con SKUs ordenados por GMROI descendente.
 * Coloca los mejores SKUs en eye-level (bandejas 2 y 3).
 *
 * Uso:
 *   npm run seed:planogramas
 */

import { config } from "dotenv"
config({ path: ".env.local" })
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const N_BANDEJAS   = 5
const N_POSICIONES = 20
const MAX_SLOTS    = N_BANDEJAS * N_POSICIONES  // 100

// Bandejas en orden de prioridad: eye-level primero
const PRIORITY_BANDEJAS = [2, 3, 4, 1, 5]

// ─── helpers ────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🗃  Generando planogramas demo…\n")

  // ── 0a. Refrescar MV de KPIs (para que los datos del seed sean visibles) ───
  console.log("  Refrescando mv_sku_kpis_mensual…")
  const { error: mvErr } = await (supabase.rpc as any)("refresh_mv_kpis_manual")
  if (mvErr) {
    console.warn("  ⚠ No se pudo refrescar la MV (puede que no exista aún):", mvErr.message)
    console.warn("    → Los planogramas se crearán sin ranking por GMROI.\n")
  } else {
    console.log("  ✓ MV refrescada\n")
  }

  // ── 0b. Borrar planogramas previos ─────────────────────────────────────────
  console.log("  Limpiando planogramas previos…")
  await supabase.from("planograma_versiones").delete().neq("id", "00000000-0000-0000-0000-000000000000")
  await supabase.from("planograma_slots").delete().neq("id", "00000000-0000-0000-0000-000000000000")
  await supabase.from("planogramas").delete().neq("id", "00000000-0000-0000-0000-000000000000")

  // ── 1. Tiendas activas (top 5) ────────────────────────────────────────────
  const { data: tiendas, error: tErr } = await supabase
    .from("tiendas")
    .select("id, nombre, ciudad")
    .eq("activa", true)
    .order("nombre")
    .limit(5)

  if (tErr || !tiendas?.length) {
    console.error("  ✗ No hay tiendas activas:", tErr?.message)
    process.exit(1)
  }
  console.log(`  ✓ ${tiendas.length} tiendas`)

  // ── 2. Categorías raíz ────────────────────────────────────────────────────
  const { data: cats, error: cErr } = await supabase
    .from("categorias")
    .select("id, nombre, ruta")
    .eq("nivel", 1)
    .order("nombre")
    .limit(6)

  if (cErr || !cats?.length) {
    console.error("  ✗ No hay categorías raíz:", cErr?.message)
    process.exit(1)
  }
  console.log(`  ✓ ${cats.length} categorías raíz`)

  // ── 3. Para cada categoría, obtener sus IDs de subcategorías ─────────────
  const catTree: Record<string, string[]> = {}
  for (const cat of cats) {
    const { data: sub } = await supabase
      .from("categorias")
      .select("id")
      .or(`id.eq.${cat.id},ruta.like.${cat.ruta}/%`)

    catTree[cat.id] = (sub ?? []).map((c: any) => c.id)
  }

  // ── 4. Pre-cargar KPIs de los últimos 12 meses ────────────────────────────
  // Agrupamos por sku_id, promediando gmroi
  console.log("  Cargando KPIs del mv_sku_kpis_mensual…")
  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceStr = since.toISOString().slice(0, 7) + "-01"

  const { data: kpis, error: kErr } = await supabase
    .from("mv_sku_kpis_mensual")
    .select("sku_id, tienda_id, gmroi")
    .gte("anio_mes", sinceStr)
    .gt("gmroi", 0)
    .lt("gmroi", 100)

  if (kErr) {
    console.error("  ✗ Error cargando KPIs:", kErr.message)
    process.exit(1)
  }

  // Index: sku_id → avg gmroi across all tiendas
  const gmroiBySkuTienda: Record<string, Record<string, number[]>> = {}
  for (const row of kpis ?? []) {
    if (!gmroiBySkuTienda[row.tienda_id]) gmroiBySkuTienda[row.tienda_id] = {}
    if (!gmroiBySkuTienda[row.tienda_id][row.sku_id]) gmroiBySkuTienda[row.tienda_id][row.sku_id] = []
    gmroiBySkuTienda[row.tienda_id][row.sku_id].push(row.gmroi)
  }

  console.log(`  ✓ KPIs cargados para ${Object.keys(gmroiBySkuTienda).length} tiendas\n`)

  // ── 5. Crear planogramas ──────────────────────────────────────────────────
  let totalPlanogramas = 0
  let totalSlots       = 0
  const hoy = new Date().toISOString().slice(0, 10)

  for (const tienda of tiendas) {
    const tiendaKpis = gmroiBySkuTienda[tienda.id] ?? {}

    for (const cat of cats) {
      process.stdout.write(`  [${tienda.nombre.slice(0, 22).padEnd(22)}] ${cat.nombre.slice(0, 20).padEnd(20)} `)

      // Obtener SKUs activos de esta categoría (raíz + sub)
      const catIds = catTree[cat.id] ?? [cat.id]
      const batches = chunk(catIds, 50)  // Supabase IN limit
      let catSkus: { id: string }[] = []

      for (const batch of batches) {
        const { data } = await supabase
          .from("skus")
          .select("id")
          .eq("activo", true)
          .in("categoria_id", batch)
          .limit(500)
        catSkus = [...catSkus, ...(data ?? [])]
      }

      if (catSkus.length < 5) {
        console.log(`→ skip (${catSkus.length} SKUs)`)
        continue
      }

      // Calcular avg GMROI por SKU en esta tienda
      // Si no hay dato de la tienda, usar GMROI global (promedio de todas las tiendas)
      const globalGmroi: Record<string, number> = {}
      for (const tData of Object.values(gmroiBySkuTienda)) {
        for (const [skuId, vals] of Object.entries(tData)) {
          if (!globalGmroi[skuId]) globalGmroi[skuId] = 0
          globalGmroi[skuId] = Math.max(globalGmroi[skuId], vals.reduce((a, b) => a + b, 0) / vals.length)
        }
      }

      const ranked = catSkus
        .map(s => {
          const tiendaVals = tiendaKpis[s.id]
          const tiendaAvg  = tiendaVals ? tiendaVals.reduce((a, b) => a + b, 0) / tiendaVals.length : null
          const gmroi      = tiendaAvg ?? globalGmroi[s.id] ?? 0
          return { id: s.id, gmroi }
        })
        .sort((a, b) => b.gmroi - a.gmroi)
        .slice(0, MAX_SLOTS)

      if (ranked.length < 5) {
        console.log(`→ skip (pocos con KPIs)`)
        continue
      }

      // Crear planograma
      const { data: plan, error: pErr } = await supabase
        .from("planogramas")
        .insert({
          nombre:               `${cat.nombre} — ${tienda.nombre}`,
          tienda_id:            tienda.id,
          categoria_id:         cat.id,
          n_bandejas:           N_BANDEJAS,
          n_posiciones:         N_POSICIONES,
          fecha_vigencia_desde: hoy,
        })
        .select("id")
        .single()

      if (pErr || !plan) {
        console.log(`→ ✗ ${pErr?.message}`)
        continue
      }

      // Construir slots: priority bandejas primero
      const slots: Array<{ planograma_id: string; bandeja: number; posicion: number; sku_id: string; frente: number }> = []
      let skuIdx = 0
      for (const bandeja of PRIORITY_BANDEJAS) {
        for (let pos = 1; pos <= N_POSICIONES; pos++) {
          if (skuIdx >= ranked.length) break
          slots.push({
            planograma_id: plan.id,
            bandeja,
            posicion: pos,
            sku_id:  ranked[skuIdx].id,
            frente:  1,
          })
          skuIdx++
        }
        if (skuIdx >= ranked.length) break
      }

      // Insert slots in batches of 50
      let slotsErr: string | null = null
      for (const batch of chunk(slots, 50)) {
        const { error } = await supabase.from("planograma_slots").insert(batch)
        if (error) { slotsErr = error.message; break }
      }

      if (slotsErr) {
        console.log(`→ ✗ slots: ${slotsErr}`)
        // Remove the empty planograma
        await supabase.from("planogramas").delete().eq("id", plan.id)
      } else {
        totalPlanogramas++
        totalSlots += slots.length
        const topGmroi = ranked[0]?.gmroi ?? 0
        console.log(`→ ✓ ${slots.length} slots · top GMROI ${topGmroi.toFixed(2)}×`)
      }
    }
  }

  console.log(`\n✓ Listo: ${totalPlanogramas} planogramas · ${totalSlots} slots en total\n`)
  if (totalPlanogramas === 0) {
    console.log("  ⚠ No se creó ningún planograma. Verifica que existan SKUs activos con datos de KPIs.")
    console.log("    Ejecuta primero: npm run seed:fake")
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
