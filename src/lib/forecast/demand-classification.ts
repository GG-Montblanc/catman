/**
 * Clasificación de patrón de demanda — método Syntetos-Boylan (ADI / CV²).
 *
 * ADI (Average Demand Interval): promedio de períodos entre demandas no-cero.
 *   Mide qué tan seguido hay ventas (eje "variabilidad en el tiempo").
 * CV² (Coefficient of Variation al cuadrado): (desv. estándar / promedio)²
 *   de los períodos CON demanda. Mide qué tan variable es la cantidad vendida
 *   cuando sí hay venta (eje "variabilidad en la cantidad").
 *
 * Cuadrantes (cortes estándar de la literatura: ADI = 1.32, CV² = 0.49):
 *   Smooth       — ADI < 1.32, CV² < 0.49  → demanda regular y predecible
 *   Erratic      — ADI < 1.32, CV² ≥ 0.49  → vende seguido pero en cantidades muy variables
 *   Intermittent — ADI ≥ 1.32, CV² < 0.49  → ventas esporádicas pero de tamaño consistente
 *   Lumpy        — ADI ≥ 1.32, CV² ≥ 0.49  → ventas esporádicas Y de tamaño errático (la más difícil de pronosticar)
 */

export type DemandPattern = "smooth" | "erratic" | "intermittent" | "lumpy"

export type DemandClassification = {
  patron: DemandPattern
  adi: number
  cv2: number
  nPeriodos: number
  nPeriodosConDemanda: number
}

const ADI_CUTOFF = 1.32
const CV2_CUTOFF = 0.49

export function classifyDemand(seriesHistorica: number[]): DemandClassification | null {
  const n = seriesHistorica.length
  if (n === 0) return null

  const conDemanda = seriesHistorica.filter(v => v > 0)
  const nConDemanda = conDemanda.length

  if (nConDemanda === 0) {
    return { patron: "intermittent", adi: n, cv2: 0, nPeriodos: n, nPeriodosConDemanda: 0 }
  }

  const adi = n / nConDemanda

  const media = conDemanda.reduce((s, v) => s + v, 0) / nConDemanda
  const varianza = nConDemanda > 1
    ? conDemanda.reduce((s, v) => s + (v - media) ** 2, 0) / nConDemanda
    : 0
  const desvEst = Math.sqrt(varianza)
  const cv2 = media > 0 ? (desvEst / media) ** 2 : 0

  let patron: DemandPattern
  if (adi < ADI_CUTOFF && cv2 < CV2_CUTOFF) patron = "smooth"
  else if (adi < ADI_CUTOFF && cv2 >= CV2_CUTOFF) patron = "erratic"
  else if (adi >= ADI_CUTOFF && cv2 < CV2_CUTOFF) patron = "intermittent"
  else patron = "lumpy"

  return {
    patron,
    adi: Math.round(adi * 100) / 100,
    cv2: Math.round(cv2 * 100) / 100,
    nPeriodos: n,
    nPeriodosConDemanda: nConDemanda,
  }
}

export const DEMAND_PATTERN_LABEL: Record<DemandPattern, string> = {
  smooth: "Smooth (regular)",
  erratic: "Erratic (errática)",
  intermittent: "Intermittent (intermitente)",
  lumpy: "Lumpy (irregular)",
}

export const DEMAND_PATTERN_DESC: Record<DemandPattern, string> = {
  smooth: "Vende seguido y en cantidades consistentes — el forecast estadístico (Holt-Winters) es confiable.",
  erratic: "Vende seguido pero en cantidades muy variables — el volumen es difícil de predecir, mantener stock de seguridad.",
  intermittent: "Ventas esporádicas pero de tamaño consistente — comprar bajo pedido o con revisión periódica.",
  lumpy: "Ventas esporádicas y de tamaño errático — el patrón más difícil de pronosticar, alto riesgo de quiebre o sobrestock.",
}

export const DEMAND_PATTERN_COLOR: Record<DemandPattern, string> = {
  smooth: "text-emerald-700 bg-emerald-100 border-emerald-200",
  erratic: "text-amber-700 bg-amber-100 border-amber-200",
  intermittent: "text-sky-700 bg-sky-100 border-sky-200",
  lumpy: "text-rose-700 bg-rose-100 border-rose-200",
}
