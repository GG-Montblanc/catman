import { createClient } from "@/lib/supabase/server"
import { PlanogramasClient } from "./PlanogramasClient"

export const metadata = { title: "Planogramas — DBS Category Tracker" }

export type PlanogramaRow = {
  id: string
  nombre: string
  n_bandejas: number
  n_posiciones: number
  fecha_vigencia_desde: string | null
  fecha_vigencia_hasta: string | null
  tienda_id: string
  tienda_nombre: string
  tienda_ciudad: string
  categoria_nombre: string
  created_at: string
  slot_count: number
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  total_ingreso: number | null
  n_tiendas_asignadas: number | null
}

export default async function PlanogramasPage() {
  const sb = await createClient()
  const { data, error } = await (sb.rpc as any)("get_planogramas_lista")

  let planogramas: PlanogramaRow[] = []

  if (!error && data) {
    planogramas = data as PlanogramaRow[]
  } else {
    // Fallback si el RPC no existe aún
    const { data: fallback } = await (sb as any)
      .from("planogramas")
      .select(`
        id, nombre, n_bandejas, n_posiciones,
        fecha_vigencia_desde, fecha_vigencia_hasta,
        tienda_id, created_at,
        tiendas:tienda_id (nombre, ciudad),
        categorias:categoria_id (nombre)
      `)
      .order("created_at", { ascending: false })
      .limit(100)

    planogramas = (fallback ?? []).map((p: any) => ({
      id:                   p.id,
      nombre:               p.nombre,
      n_bandejas:           p.n_bandejas,
      n_posiciones:         p.n_posiciones,
      fecha_vigencia_desde: p.fecha_vigencia_desde,
      fecha_vigencia_hasta: p.fecha_vigencia_hasta,
      tienda_id:            p.tienda_id,
      tienda_nombre:        p.tiendas?.nombre ?? "—",
      tienda_ciudad:        p.tiendas?.ciudad ?? "",
      categoria_nombre:     p.categorias?.nombre ?? "—",
      created_at:           p.created_at,
      slot_count:           0,
      avg_gmroi:            null,
      avg_sellthru:         null,
      avg_margen_pct:       null,
      total_ingreso:        null,
      n_tiendas_asignadas:  null,
    }))
  }

  return <PlanogramasClient planogramas={planogramas} />
}
