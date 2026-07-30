import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ComplianceClient } from "./ComplianceClient"
import type { PlanogramData } from "@/lib/planogram/types"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: "Compliance — DBS CatMan" }
}

export default async function CompliancePage({ params }: Props) {
  const { id } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_con_kpis", { p_planograma_id: id })
  if (error || !data) notFound()
  const planograma = data as PlanogramData

  const [{ data: fotos }, { data: checklist }] = await Promise.all([
    (sb.rpc as any)("get_fotos_compliance", { p_planograma_id: id }),
    (sb.rpc as any)("get_checklist_planograma", { p_planograma_id: id }),
  ])

  return (
    <ComplianceClient
      planograma={planograma}
      fotos={fotos ?? []}
      checklist={checklist ?? []}
    />
  )
}
