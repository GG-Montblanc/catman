import { createClient } from "@/lib/supabase/client"
import type {
  GlobalKpis,
  TendenciaMensual,
  TopBottomSkus,
  HeatmapCell,
  DashboardFilters,
} from "./types"

function getClient() {
  return createClient()
}

function filtersToParams(f: DashboardFilters) {
  return {
    p_desde:     f.desde,
    p_hasta:     f.hasta,
    p_tienda:    f.tienda    || null,
    p_canal:     f.canal     || null,
    p_region:    f.region    || null,
    p_formato:   f.formato   || null,
    p_categoria: f.categoria || null,
    p_marca:     f.marca     || null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export async function fetchGlobalKpis(f: DashboardFilters): Promise<GlobalKpis | null> {
  const sb = getClient()
  // RPC types not yet in generated schema — cast args to any
  const { data, error } = await (sb.rpc as any)("dashboard_kpis_globales", filtersToParams(f))
  if (error) {
    console.error("dashboard_kpis_globales:", error.message)
    return null
  }
  return data as GlobalKpis
}

export async function fetchTendencia(f: DashboardFilters): Promise<TendenciaMensual[]> {
  const sb = getClient()
  const { data, error } = await (sb.rpc as any)("dashboard_tendencia_mensual", filtersToParams(f))
  if (error) {
    console.error("dashboard_tendencia_mensual:", error.message)
    return []
  }
  return (data as TendenciaMensual[]) ?? []
}

export async function fetchTopBottomSkus(f: DashboardFilters, limit = 10): Promise<TopBottomSkus> {
  const sb = getClient()
  const { data, error } = await (sb.rpc as any)("dashboard_top_skus_gmroi", {
    ...filtersToParams(f),
    p_limit: limit,
  })
  if (error) {
    console.error("dashboard_top_skus_gmroi:", error.message)
    return { top: [], bottom: [] }
  }
  return (data as TopBottomSkus) ?? { top: [], bottom: [] }
}

export async function fetchHeatmap(desde: string, hasta: string): Promise<HeatmapCell[]> {
  const sb = getClient()
  const { data, error } = await (sb.rpc as any)("dashboard_heatmap_cat_tienda", {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) {
    console.error("dashboard_heatmap_cat_tienda:", error.message)
    return []
  }
  return (data as HeatmapCell[]) ?? []
}

// Helpers para el FilterBar: carga opciones de filtros
export async function fetchFilterOptions() {
  const sb = getClient()
  const [tiendas, categorias, marcas] = await Promise.all([
    sb.from("tiendas")
      .select("id, nombre, region, canal, formato")
      .eq("activa", true)
      .order("nombre"),
    sb.from("categorias")
      .select("id, nombre, ruta, nivel")
      .lte("nivel", 2)
      .order("ruta"),
    sb.from("marcas")
      .select("id, nombre")
      .order("nombre"),
  ])
  return {
    tiendas:    tiendas.data    ?? [],
    categorias: categorias.data ?? [],
    marcas:     marcas.data     ?? [],
  }
}
