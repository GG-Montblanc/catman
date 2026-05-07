import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PlanogramEditor } from "./PlanogramEditor"
import type { PlanogramData } from "@/lib/planogram/types"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `Editor ${id.slice(0, 8)}… — DBS` }
}

export default async function EditorPage({ params }: Props) {
  const { id } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_con_kpis", {
    p_planograma_id: id,
  })

  if (error || !data) notFound()

  const planograma = data as PlanogramData

  // Load available SKUs for the same category (for the SkuPool)
  const { data: skusDisponiblesRaw } = await (sb as any)
    .from("skus")
    .select(`
      id, nombre, sku_externo, imagen_url, precio_lista,
      marcas:marca_id (nombre)
    `)
    .eq("categoria_id", planograma.categoria.id)
    .eq("activo", true)
    .order("nombre")
    .limit(200)

  type SkuRow = {
    id: string
    nombre: string
    sku_externo: string
    imagen_url: string | null
    precio_lista: number
    marcas: { nombre: string } | null
  }

  const skusDisponibles: SkuRow[] = (skusDisponiblesRaw ?? []) as SkuRow[]

  const skusPool = skusDisponibles.map((s) => ({
    id:           s.id,
    nombre:       s.nombre,
    sku_externo:  s.sku_externo,
    imagen_url:   s.imagen_url,
    precio_lista: s.precio_lista,
    marca_nombre: s.marcas?.nombre ?? null,
    categoria_id: planograma.categoria.id,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/planogramas" className="hover:text-foreground">Planogramas</a>
        <span>/</span>
        <a href={`/planogramas/${id}/simulador`} className="hover:text-foreground truncate max-w-[200px]">
          {planograma.nombre}
        </a>
        <span>/</span>
        <span className="text-foreground font-medium">Editor</span>
      </div>

      <PlanogramEditor planograma={planograma} skusPool={skusPool} />
    </div>
  )
}
