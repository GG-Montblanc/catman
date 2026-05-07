/**
 * Motor de forecasting de SKUs.
 * Combina Holt-Winters con datos de ventas e inventario para generar
 * pronósticos, alertas y sugerencias de compra por SKU.
 */

import { createClient } from "@/lib/supabase/server"
import { holtWinters } from "./holt-winters"

export type ForecastResult = {
  sku_id: string
  series_historica: number[]           // unidades vendidas por mes (orden cronológico)
  forecast_unidades: number[]          // pronóstico 6 meses
  forecast_ingreso: number[]           // pronóstico ingreso (unidades × precio_lista)
  mape: number
  tendencia: "creciente" | "estable" | "decreciente"
  meses_cobertura_actual: number       // MDI actual
  unidades_sugeridas_compra: number    // max(0, objetivo - stock_actual - en_tránsito)
  alerta: "ok" | "quiebre_riesgo" | "sobrestock"
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

export async function forecastSku(params: {
  sku_id: string
  tienda_id?: string | null
  precio_lista: number
  meses_lead_time?: number   // default 5 (importados)
  semanas_target?: number    // default 10
}): Promise<ForecastResult> {
  const {
    sku_id,
    tienda_id,
    precio_lista,
    meses_lead_time = 5,
    semanas_target = 10,
  } = params

  const sb = await createClient()

  // ── 1. Ventas históricas (últimos 24 meses o todos los disponibles) ───────
  const ventasQuery = sb
    .from("ventas_fact")
    .select("anio_mes, unidades")
    .eq("sku_id", sku_id)
    .order("anio_mes", { ascending: true })

  // Limitar a 24 meses hacia atrás desde hoy
  const desde = new Date()
  desde.setMonth(desde.getMonth() - 24)
  const desdeStr = desde.toISOString().slice(0, 10)
  ventasQuery.gte("anio_mes", desdeStr)

  if (tienda_id) {
    ventasQuery.eq("tienda_id", tienda_id)
  }

  const { data: ventasRaw, error: ventasError } = await ventasQuery

  if (ventasError) {
    console.error("forecastSku ventas:", ventasError.message)
  }

  // Si hay múltiples tiendas (sin filtro), agrupar por anio_mes
  type VentaRow = { anio_mes: string; unidades: number }
  const ventasPorMes = new Map<string, number>()
  for (const row of (ventasRaw ?? []) as VentaRow[]) {
    ventasPorMes.set(
      row.anio_mes,
      (ventasPorMes.get(row.anio_mes) ?? 0) + (row.unidades ?? 0)
    )
  }

  // Ordenar cronológicamente y extraer serie
  const mesesOrdenados = [...ventasPorMes.keys()].sort()
  const series_historica = mesesOrdenados.map(m => ventasPorMes.get(m) ?? 0)

  // ── 2. Inventario actual (último mes disponible) ──────────────────────────
  const invQuery = sb
    .from("inventario_fact")
    .select("stock_fin, mdi_meses")
    .eq("sku_id", sku_id)
    .order("anio_mes", { ascending: false })
    .limit(1)

  if (tienda_id) {
    invQuery.eq("tienda_id", tienda_id)
  }

  const { data: invRaw } = await invQuery

  type InvRow = { stock_fin: number; mdi_meses: number }
  const inv = ((invRaw ?? []) as InvRow[])[0]
  const stock_actual       = inv?.stock_fin  ?? 0
  const meses_cobertura_actual = inv?.mdi_meses ?? 0

  // ── 3. Holt-Winters ───────────────────────────────────────────────────────
  const hw = holtWinters(series_historica, { horizon: 6 })

  const forecast_unidades = hw.forecast.map(v => Math.max(0, Math.round(v)))
  const forecast_ingreso  = forecast_unidades.map(u => Math.round(u * precio_lista * 100) / 100)
  const mape              = hw.mape

  // ── 4. Tendencia ─────────────────────────────────────────────────────────
  const primerTres = mean(forecast_unidades.slice(0, 3))
  const ultimoTres = mean(forecast_unidades.slice(3, 6))
  let tendencia: ForecastResult["tendencia"] = "estable"
  if (primerTres > 0) {
    const cambio = (ultimoTres - primerTres) / primerTres
    if (cambio > 0.1)       tendencia = "creciente"
    else if (cambio < -0.1) tendencia = "decreciente"
  }

  // ── 5. Unidades sugeridas de compra ──────────────────────────────────────
  const forecast_promedio_mensual = mean(forecast_unidades)
  const semanas_forecast          = semanas_target + meses_lead_time * 4.3
  const inventario_objetivo       = forecast_promedio_mensual * semanas_forecast / 4.3
  const unidades_sugeridas_compra = Math.max(0, Math.round(inventario_objetivo - stock_actual))

  // ── 6. Alertas ───────────────────────────────────────────────────────────
  let alerta: ForecastResult["alerta"] = "ok"
  if (stock_actual < (forecast_unidades[0] ?? 0) * 0.5) {
    alerta = "quiebre_riesgo"
  } else if (meses_cobertura_actual > 4) {
    alerta = "sobrestock"
  }

  return {
    sku_id,
    series_historica,
    forecast_unidades,
    forecast_ingreso,
    mape,
    tendencia,
    meses_cobertura_actual,
    unidades_sugeridas_compra,
    alerta,
  }
}
