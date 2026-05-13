import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PedidoClient } from "./PedidoClient"

export const metadata = { title: "Pedido sugerido — Planograma" }

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = await createClient()

  // Datos del planograma
  const { data: planograma } = await (sb as any)
    .from("planogramas")
    .select("id, nombre, tiendas(nombre, ciudad), categorias(nombre)")
    .eq("id", id)
    .single()

  if (!planograma) notFound()

  // Pedido sugerido
  const { data: pedido } = await (sb.rpc as any)("get_planograma_pedido", {
    p_planograma_id: id,
  })

  return (
    <PedidoClient
      planogramaId={id}
      nombre={planograma.nombre}
      tienda={planograma.tiendas?.nombre ?? "—"}
      ciudad={planograma.tiendas?.ciudad ?? ""}
      categoria={planograma.categorias?.nombre ?? "—"}
      items={pedido ?? []}
    />
  )
}
