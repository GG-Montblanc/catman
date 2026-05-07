import { createClient } from "@/lib/supabase/server"
import { WizardClient } from "./WizardClient"

export const metadata = { title: "Nuevo Planograma — DBS Category Tracker" }

type Tienda = { id: string; nombre: string; ciudad: string }
type Categoria = { id: string; nombre: string; ruta: string }

export default async function NuevoPlanogramaPage() {
  const sb = await createClient()

  const [{ data: tiendasRaw }, { data: categoriasRaw }] = await Promise.all([
    sb.from("tiendas").select("id, nombre, ciudad").order("nombre"),
    (sb as any)
      .from("categorias")
      .select("id, nombre, ruta")
      .eq("nivel", 1)
      .order("nombre"),
  ])

  const tiendas: Tienda[] = (tiendasRaw ?? []) as Tienda[]
  const categorias: Categoria[] = (categoriasRaw ?? []) as Categoria[]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/planogramas" className="hover:text-foreground">Planogramas</a>
        <span>/</span>
        <span className="text-foreground font-medium">Nuevo</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo planograma</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configura los parámetros y genera un planograma optimizado automáticamente.
        </p>
      </div>

      <WizardClient tiendas={tiendas} categorias={categorias} />
    </div>
  )
}
