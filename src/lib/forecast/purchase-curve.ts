/**
 * Curva de compra — a partir de un pronóstico de demanda (Holt-Winters),
 * proyecta el agotamiento de stock y determina cuándo y cuánto reponer.
 *
 * Modelo: punto de reorden (ROP) clásico.
 *   ROP = demanda promedio mensual × lead time (meses)
 *   Objetivo de inventario = demanda promedio mensual × (semanas objetivo/4.3 + lead time)
 * Se simula mes a mes el stock proyectado (sin reposición) y se marca el primer
 * mes en que el stock de inicio de mes cae bajo el ROP: ahí hay que emitir la orden.
 */

export type PurchaseCurvePoint = {
  mes: string
  stock_proyectado: number | null
  punto_reorden: number
}

export type PurchaseRecommendation = {
  mesCompraIdx: number | null   // índice dentro de forecastUnidades (0-based) en que hay que comprar
  unidadesSugeridas: number
  valorEstimado: number
  urgente: boolean              // ya está bajo el punto de reorden hoy
  puntoReorden: number
  inventarioObjetivo: number
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

export function buildPurchaseCurve(params: {
  forecastUnidades: number[]
  stockActual: number
  precioLista: number
  leadTimeDias?: number
  semanasTarget?: number
}): { stockProyectado: number[]; recomendacion: PurchaseRecommendation } {
  const {
    forecastUnidades,
    stockActual,
    precioLista,
    leadTimeDias = 150,
    semanasTarget = 10,
  } = params

  const leadTimeMeses = leadTimeDias / 30
  const demandaPromedioMensual = mean(forecastUnidades)

  const puntoReorden = demandaPromedioMensual * leadTimeMeses
  const inventarioObjetivo = demandaPromedioMensual * (semanasTarget / 4.3 + leadTimeMeses)

  // Simulación de agotamiento mes a mes (sin reposición)
  const stockProyectado: number[] = []
  let stockInicioMes = stockActual
  let mesCompraIdx: number | null = null

  for (let i = 0; i < forecastUnidades.length; i++) {
    if (mesCompraIdx === null && stockInicioMes <= puntoReorden) {
      mesCompraIdx = i
    }
    const stockFinMes = stockInicioMes - forecastUnidades[i]
    stockProyectado.push(stockFinMes)
    stockInicioMes = stockFinMes
  }

  const urgente = stockActual <= puntoReorden
  const stockEnMomentoCompra = mesCompraIdx !== null
    ? (mesCompraIdx === 0 ? stockActual : stockProyectado[mesCompraIdx - 1])
    : stockActual

  const unidadesSugeridas = mesCompraIdx !== null
    ? Math.max(0, Math.round(inventarioObjetivo - stockEnMomentoCompra))
    : 0

  return {
    stockProyectado,
    recomendacion: {
      mesCompraIdx,
      unidadesSugeridas,
      valorEstimado: Math.round(unidadesSugeridas * precioLista * 100) / 100,
      urgente,
      puntoReorden: Math.round(puntoReorden * 10) / 10,
      inventarioObjetivo: Math.round(inventarioObjetivo * 10) / 10,
    },
  }
}
