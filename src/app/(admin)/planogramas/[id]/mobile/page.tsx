import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { MobileView } from "./MobileView"

export const metadata = { title: "Planograma — Vista Local" }

export default async function MobilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_mobile", {
    p_planograma_id: id,
  })

  if (error || !data) notFound()

  return <MobileView data={data} />
}
