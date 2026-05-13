import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SimuladorClient } from "./SimuladorClient"
import { QrButton } from "../mobile/QrSheet"
import type { PlanogramData } from "@/lib/planogram/types"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `Simulador ${id.slice(0, 8)}… — DBS` }
}

export default async function SimuladorPage({ params }: Props) {
  const { id } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_con_kpis", {
    p_planograma_id: id,
  })

  if (error || !data) notFound()

  const planograma = data as PlanogramData

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <a href="/planogramas" className="hover:text-foreground">Planogramas</a>
          <span>/</span>
          <span className="text-foreground font-medium">Simulador</span>
        </div>
        <QrButton planogramaId={id} nombre={planograma.nombre} />
      </div>
      <SimuladorClient planograma={planograma} />
    </div>
  )
}
