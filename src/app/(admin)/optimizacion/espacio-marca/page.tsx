import { createClient } from "@/lib/supabase/server"
import { EspacioMarcaClient } from "./EspacioMarcaClient"

export const metadata = { title: "Espacio por marca — DBS" }

export type EspacioMarcaRow = {
  marca_id: string
  marca_nombre: string
  slots_actuales: number
  pct_espacio: number
  total_ingreso: number
  pct_ventas: number
  avg_gmroi: number
  slots_optimos: number
}

export default async function EspacioMarcaPage() {
  const sb = await createClient()

  const { data } = await (sb.rpc as any)("get_espacio_marca", {})

  const rows = (data ?? []) as EspacioMarcaRow[]
  const totalSlots = rows.reduce((acc, r) => acc + (r.slots_actuales ?? 0), 0)

  return (
    <div className="p-4 sm:p-6">
      <EspacioMarcaClient data={rows} totalSlots={totalSlots} />
    </div>
  )
}
