import { createClient } from "@/lib/supabase/server"
import { ReportePosicionClient } from "./ReportePosicionClient"
import type { PlanogramData } from "@/lib/planogram/types"

export const metadata = { title: "Ventas por posición — DBS CatMan" }

export type PosicionAgregada = {
  bandeja: number
  n_slots: number
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  total_ingreso: number
}

export type TercioAgregado = {
  tercio: "izquierda" | "centro" | "derecha"
  n_slots: number
  avg_gmroi: number | null
  avg_sellthru: number | null
  total_ingreso: number
}

export default async function ReportePosicionPage() {
  const sb = await createClient()

  // 1. Lista de planogramas activos (RPC ya existente)
  const { data: lista } = await (sb.rpc as any)("get_planogramas_lista")
  const ids: string[] = ((lista ?? []) as { id: string }[]).map(p => p.id)

  // 2. Detalle por planograma (RPC ya existente, reusada N veces)
  const detalles = await Promise.all(
    ids.map(async id => {
      const { data } = await (sb.rpc as any)("get_planograma_con_kpis", { p_planograma_id: id })
      return data as PlanogramData | null
    })
  )

  // 3. Agregación por número de bandeja
  const porBandeja = new Map<number, { gmroi: number[]; sellthru: number[]; margen: number[]; ingreso: number; n: number }>()
  // 4. Agregación por tercio de posición (izquierda/centro/derecha, normalizado por n_posiciones de cada planograma)
  const porTercio = new Map<string, { gmroi: number[]; sellthru: number[]; ingreso: number; n: number }>()

  for (const p of detalles) {
    if (!p) continue
    for (const slot of p.slots ?? []) {
      const k = slot.kpis
      const b = porBandeja.get(slot.bandeja) ?? { gmroi: [], sellthru: [], margen: [], ingreso: 0, n: 0 }
      if (k?.avg_gmroi != null) b.gmroi.push(k.avg_gmroi)
      if (k?.avg_sellthru != null) b.sellthru.push(k.avg_sellthru)
      if (k?.avg_margen_pct != null) b.margen.push(k.avg_margen_pct)
      b.ingreso += k?.total_ingreso ?? 0
      b.n += 1
      porBandeja.set(slot.bandeja, b)

      const frac = p.n_posiciones > 0 ? (slot.posicion - 1) / p.n_posiciones : 0.5
      const tercio = frac < 0.34 ? "izquierda" : frac < 0.67 ? "centro" : "derecha"
      const t = porTercio.get(tercio) ?? { gmroi: [], sellthru: [], ingreso: 0, n: 0 }
      if (k?.avg_gmroi != null) t.gmroi.push(k.avg_gmroi)
      if (k?.avg_sellthru != null) t.sellthru.push(k.avg_sellthru)
      t.ingreso += k?.total_ingreso ?? 0
      t.n += 1
      porTercio.set(tercio, t)
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  const bandejas: PosicionAgregada[] = Array.from(porBandeja.entries())
    .map(([bandeja, v]) => ({
      bandeja,
      n_slots: v.n,
      avg_gmroi: avg(v.gmroi),
      avg_sellthru: avg(v.sellthru),
      avg_margen_pct: avg(v.margen),
      total_ingreso: v.ingreso,
    }))
    .sort((a, b) => a.bandeja - b.bandeja)

  const ordenTercio: TercioAgregado["tercio"][] = ["izquierda", "centro", "derecha"]
  const tercios: TercioAgregado[] = ordenTercio.map(t => {
    const v = porTercio.get(t) ?? { gmroi: [], sellthru: [], ingreso: 0, n: 0 }
    return {
      tercio: t,
      n_slots: v.n,
      avg_gmroi: avg(v.gmroi),
      avg_sellthru: avg(v.sellthru),
      total_ingreso: v.ingreso,
    }
  })

  return (
    <ReportePosicionClient
      bandejas={bandejas}
      tercios={tercios}
      nPlanogramas={detalles.filter(Boolean).length}
    />
  )
}
