import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ImprimirClient } from "./ImprimirClient"
import type { PlanogramData } from "@/lib/planogram/types"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: "Imprimir planograma — DBS CatMan" }
}

export default async function ImprimirPage({ params }: Props) {
  const { id } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_con_kpis", {
    p_planograma_id: id,
  })

  if (error || !data) notFound()

  const planograma = data as PlanogramData

  return <ImprimirClient planograma={planograma} />
}
