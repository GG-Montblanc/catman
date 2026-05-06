export type GlobalKpis = {
  avg_gmroi: number | null
  avg_sellthru_pct: number | null
  avg_sell_to_stock: number | null
  avg_margen_pct: number | null
  avg_dias_stock: number | null
  avg_fill_rate: number | null
  pct_obsoletos: number | null
  total_ingreso: number | null
  total_margen: number | null
  total_unidades: number | null
}

export type TendenciaMensual = {
  anio_mes: string        // "YYYY-MM-DD"
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  avg_fill_rate: number | null
  total_ingreso: number | null
  total_margen: number | null
}

export type SkuKpiItem = {
  sku_id: string
  nombre: string
  imagen_url: string | null
  marca_nombre: string | null
  categoria_nombre: string | null
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  total_ingreso: number | null
  total_margen: number | null
}

export type TopBottomSkus = {
  top: SkuKpiItem[]
  bottom: SkuKpiItem[]
}

export type HeatmapCell = {
  cat_id: string
  cat_nombre: string
  tienda_id: string
  tienda_nombre: string
  avg_gmroi: number | null
  total_ingreso: number | null
}

export type SkuConKpis = {
  id: string
  sku_externo: string
  nombre: string
  imagen_url: string | null
  precio_lista: number
  marca_nombre: string | null
  categoria_nombre: string | null
  categoria_ruta: string | null
  avg_gmroi: number | null
  avg_sellthru_pct: number | null
  avg_s2s: number | null
  avg_margen_pct: number | null
  avg_dias_stock: number | null
  avg_fill_rate: number | null
  avg_mdi_meses: number | null
  total_ingreso: number | null
  total_margen: number | null
}

export type DashboardFilters = {
  desde: string
  hasta: string
  tienda?: string
  canal?: string
  region?: string
  formato?: string
  categoria?: string
  marca?: string
}

// Rangos para semáforos visuales
export function gmroiColor(v: number | null): "green" | "yellow" | "red" | "gray" {
  if (v == null) return "gray"
  if (v >= 2.6) return "green"
  if (v >= 1.4) return "yellow"
  return "red"
}

export function mdiColor(v: number | null): "green" | "yellow" | "orange" | "red" {
  if (v == null) return "green"
  if (v <= 3)  return "green"
  if (v <= 6)  return "yellow"
  if (v <= 12) return "orange"
  return "red"
}

export function sellthruColor(v: number | null): "green" | "yellow" | "red" | "gray" {
  if (v == null) return "gray"
  if (v >= 70) return "green"
  if (v >= 40) return "yellow"
  return "red"
}
