import type { PlanogramSlot } from "./types"

/**
 * Rentabilidad por espacio a nivel de SKU dentro de un planograma —
 * misma lógica que get_espacio_marca (70% peso por ingreso + 30% por
 * GMROI relativo al máximo del planograma), pero por SKU/bandeja en vez
 * de por marca, y calculada client-side sobre los slots ya cargados
 * (no requiere una consulta nueva).
 */
export type EspacioSkuInfo = {
  sku_id: string
  nombre: string
  imagen_url: string | null
  frentes_actual: number
  frentes_optimo: number
  delta: number
  pct_ingreso: number
  pct_espacio: number
  avg_gmroi: number | null
}

export function calcularEspacioPorSku(slots: PlanogramSlot[]): EspacioSkuInfo[] {
  type Acc = { nombre: string; imagen_url: string | null; frentes: number; ingreso: number; gmroiSum: number; gmroiCount: number }
  const bySku = new Map<string, Acc>()
  let totalFrentes = 0
  let totalIngreso = 0

  for (const slot of slots) {
    if (!slot.sku) continue
    totalFrentes += slot.frente
    const ingreso = slot.kpis?.total_ingreso ?? 0
    totalIngreso += ingreso

    const cur = bySku.get(slot.sku.id) ?? {
      nombre: slot.sku.nombre,
      imagen_url: slot.sku.imagen_url,
      frentes: 0,
      ingreso: 0,
      gmroiSum: 0,
      gmroiCount: 0,
    }
    cur.frentes += slot.frente
    cur.ingreso += ingreso
    if (slot.kpis?.avg_gmroi != null) {
      cur.gmroiSum += slot.kpis.avg_gmroi
      cur.gmroiCount += 1
    }
    bySku.set(slot.sku.id, cur)
  }

  if (totalFrentes === 0) return []

  // El GMROI de un SKU sin ingreso real es ruido (pocos o ningun dato) —
  // solo cuenta como señal de "merece mas espacio" si ademas vendio algo.
  // Se normaliza como PARTICIPACION (gmroi_sku / suma de todos), igual que
  // el ingreso, no como razon al maximo — con "/max" varios SKUs pueden
  // estar cada uno cerca del tope a la vez y sobre-asignar espacio en
  // conjunto (no reparte un total de 100%, cada uno pide su propio 30%).
  const sumGmroi = [...bySku.values()]
    .filter(v => v.ingreso > 0 && v.gmroiCount > 0)
    .reduce((s, v) => s + v.gmroiSum / v.gmroiCount, 0)

  return [...bySku.entries()]
    .map(([sku_id, v]) => {
      const avgGmroi = v.gmroiCount ? v.gmroiSum / v.gmroiCount : null
      const pctIngreso = totalIngreso > 0 ? v.ingreso / totalIngreso : 0
      const pctGmroiRelativo = (avgGmroi != null && v.ingreso > 0 && sumGmroi > 0) ? avgGmroi / sumGmroi : 0
      const frentesOptimo = totalFrentes * (0.7 * pctIngreso + 0.3 * pctGmroiRelativo)

      return {
        sku_id,
        nombre: v.nombre,
        imagen_url: v.imagen_url,
        frentes_actual: v.frentes,
        frentes_optimo: Math.round(frentesOptimo * 10) / 10,
        delta: Math.round((v.frentes - frentesOptimo) * 10) / 10,
        pct_ingreso: Math.round(pctIngreso * 1000) / 10,
        pct_espacio: Math.round((v.frentes / totalFrentes) * 1000) / 10,
        avg_gmroi: avgGmroi,
      }
    })
    .sort((a, b) => b.delta - a.delta)
}
