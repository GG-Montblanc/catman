import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { CategoriaDetalleClient } from "./CategoriaDetalleClient"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const sb = await createClient()
  const { data } = await sb
    .from("categorias")
    .select("nombre")
    .eq("slug", slug)
    .single()
  const nombre = data?.nombre ?? slug
  return { title: `${nombre} — DBS Category Tracker` }
}

export default async function CategoriaDetallePage({ params }: Props) {
  const { slug } = await params
  const sb = await createClient()

  // Resolve slug → categoria
  const { data: cat, error: catError } = await sb
    .from("categorias")
    .select("id, nombre, slug")
    .eq("slug", slug)
    .single()

  if (catError || !cat) {
    notFound()
  }

  // Fetch detalle via RPC
  const { data: rpcData, error: rpcError } = await (sb.rpc as any)(
    "get_categoria_detalle",
    { p_categoria_id: cat.id, p_meses: 6 }
  )
  if (rpcError) {
    console.error("get_categoria_detalle:", rpcError.message)
  }

  const detalle = rpcData?.[0] ?? null

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <a href="/categorias" className="hover:text-foreground transition-colors">
          Categorías
        </a>
        <span>/</span>
        <span className="text-foreground font-medium">{cat.nombre}</span>
      </nav>

      <CategoriaDetalleClient
        data={detalle}
        categoriaId={cat.id}
        nombre={cat.nombre}
        slug={slug}
      />
    </div>
  )
}
