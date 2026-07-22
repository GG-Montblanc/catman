import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { TiendaDetalleClient } from "./TiendaDetalleClient"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const sb = await createClient()
  const { data } = await sb
    .from("tiendas")
    .select("nombre")
    .eq("id", id)
    .single()
  const nombre = data?.nombre ?? "Tienda"
  return { title: `${nombre} — DBS CatMan` }
}

export default async function TiendaDetallePage({ params }: Props) {
  const { id } = await params
  const sb = await createClient()

  // Load tienda
  const { data: tienda, error: tiendaError } = await sb
    .from("tiendas")
    .select("id, nombre, ciudad, region, canal, formato")
    .eq("id", id)
    .single()

  if (tiendaError || !tienda) {
    notFound()
  }

  // Fetch detalle via RPC
  const { data: rpcData, error: rpcError } = await (sb.rpc as any)(
    "get_tienda_detalle",
    { p_tienda_id: id, p_meses: 6 }
  )
  if (rpcError) {
    console.error("get_tienda_detalle:", rpcError.message)
  }

  const detalle = rpcData?.[0] ?? null

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <a href="/tiendas" className="hover:text-foreground transition-colors">
          Tiendas
        </a>
        <span>/</span>
        <span className="text-foreground font-medium">{tienda.nombre}</span>
      </nav>

      <TiendaDetalleClient
        data={detalle}
        tiendaId={id}
        tiendaInfo={{
          nombre: tienda.nombre,
          ciudad: tienda.ciudad,
          region: tienda.region,
          canal: tienda.canal,
          formato: tienda.formato,
        }}
      />
    </div>
  )
}
