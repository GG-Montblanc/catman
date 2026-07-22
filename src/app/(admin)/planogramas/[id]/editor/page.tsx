import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PlanogramEditor } from "./PlanogramEditor"
import type { PlanogramData } from "@/lib/planogram/types"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `Editor — DBS CatMan` }
}

export default async function EditorPage({ params }: Props) {
  const { id } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_con_kpis", {
    p_planograma_id: id,
  })

  if (error || !data) notFound()

  const planograma = data as PlanogramData

  // ── Load pool SKUs: all subcategories + KPIs ──────────────────────────────
  // 1. Resolve category ruta for descendant matching
  const { data: catData } = await sb
    .from("categorias")
    .select("ruta")
    .eq("id", planograma.categoria.id)
    .single()

  const rutaPrefix = catData?.ruta ?? ""

  // 2. Get all descendant category IDs (root + children)
  const { data: descCats } = await sb
    .from("categorias")
    .select("id")
    .or(`id.eq.${planograma.categoria.id},ruta.like.${rutaPrefix}/%`)

  const descCatIds = (descCats ?? []).map(c => c.id)

  // 3. Fetch SKUs in all descendant categories
  const { data: skusRaw } = await sb
    .from("skus")
    .select(`
      id, nombre, sku_externo, imagen_url, precio_lista,
      categoria_id,
      marcas:marca_id (nombre)
    `)
    .in("categoria_id", descCatIds.length > 0 ? descCatIds : [planograma.categoria.id])
    .eq("activo", true)
    .order("nombre")
    .limit(300)

  type SkuRow = {
    id: string
    nombre: string
    sku_externo: string
    imagen_url: string | null
    precio_lista: number
    categoria_id: string
    marcas: { nombre: string } | null
  }

  const skusRawTyped: SkuRow[] = (skusRaw ?? []) as SkuRow[]

  // 4. Fetch KPIs for those SKUs from mv_sku_kpis_mensual (last 6m, tienda-specific)
  const skuIds = skusRawTyped.map(s => s.id)
  type KpiRow = { sku_id: string; avg_gmroi: number | null; avg_sellthru: number | null; avg_margen_pct: number | null }

  let kpiMap = new Map<string, KpiRow>()

  if (skuIds.length > 0) {
    // Query kpis in batches of 100 to avoid URL length issues
    const BATCH = 100
    const since = new Date()
    since.setMonth(since.getMonth() - 6)
    const sinceStr = since.toISOString().slice(0, 10)

    for (let i = 0; i < skuIds.length; i += BATCH) {
      const batch = skuIds.slice(i, i + BATCH)
      const { data: kpisRaw } = await sb
        .from("mv_sku_kpis_mensual")
        .select("sku_id, gmroi, sellthru_pct, margen_pct")
        .in("sku_id", batch)
        .eq("tienda_id", planograma.tienda.id)
        .gte("anio_mes", sinceStr)

      const kpis = (kpisRaw ?? []) as { sku_id: string; gmroi: number | null; sellthru_pct: number | null; margen_pct: number | null }[]

      for (const k of kpis) {
        const existing = kpiMap.get(k.sku_id)
        if (!existing) {
          kpiMap.set(k.sku_id, {
            sku_id: k.sku_id,
            avg_gmroi: k.gmroi,
            avg_sellthru: k.sellthru_pct,
            avg_margen_pct: k.margen_pct,
          })
        } else {
          // Accumulate to average later — store sum and count
          const entry = kpiMap.get(k.sku_id)!
          kpiMap.set(k.sku_id, {
            sku_id: k.sku_id,
            avg_gmroi:      ((entry.avg_gmroi ?? 0) + (k.gmroi ?? 0)) / 2,
            avg_sellthru:   ((entry.avg_sellthru ?? 0) + (k.sellthru_pct ?? 0)) / 2,
            avg_margen_pct: ((entry.avg_margen_pct ?? 0) + (k.margen_pct ?? 0)) / 2,
          })
        }
      }
    }
  }

  // 5. Build final pool
  const skusPool = skusRawTyped.map(s => {
    const kpi = kpiMap.get(s.id)
    return {
      id:             s.id,
      nombre:         s.nombre,
      sku_externo:    s.sku_externo,
      imagen_url:     s.imagen_url,
      precio_lista:   s.precio_lista,
      marca_nombre:   s.marcas?.nombre ?? null,
      categoria_id:   s.categoria_id,
      avg_gmroi:      kpi?.avg_gmroi      ?? null,
      avg_sellthru:   kpi?.avg_sellthru   ?? null,
      avg_margen_pct: kpi?.avg_margen_pct ?? null,
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/planogramas" className="hover:text-foreground">Planogramas</a>
        <span>/</span>
        <a href={`/planogramas/${id}/simulador`} className="hover:text-foreground truncate max-w-[200px]">
          {planograma.nombre}
        </a>
        <span>/</span>
        <span className="text-foreground font-medium">Editor</span>
      </div>

      <PlanogramEditor planograma={planograma} skusPool={skusPool} />
    </div>
  )
}
