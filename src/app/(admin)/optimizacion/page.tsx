import { createClient } from "@/lib/supabase/server"
import { OptimizacionClient } from "./OptimizacionClient"

export const metadata = { title: "Optimización — DBS CatMan" }

export default async function OptimizacionPage() {
  const sb = await createClient()

  const [cuadranteRes, tiendasRes, categoriasRes] = await Promise.all([
    (sb.rpc as any)("get_optimizacion_cuadrante", {}),
    sb.from("tiendas").select("id, nombre").eq("activa", true).order("nombre"),
    sb.from("categorias").select("id, nombre").lte("nivel", 2).order("nombre"),
  ])

  const cuadrante = (cuadranteRes.data ?? []) as CuadranteRow[]
  const tiendas   = (tiendasRes.data   ?? []) as { id: string; nombre: string }[]
  const categorias = (categoriasRes.data ?? []) as { id: string; nombre: string }[]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Optimización</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Matriz cuadrantes GMROI × Sellthru y órdenes de compra sugeridas
        </p>
      </div>
      <OptimizacionClient
        cuadrante={cuadrante}
        tiendas={tiendas}
        categorias={categorias}
      />
    </div>
  )
}

export type CuadranteRow = {
  sku_id: string
  nombre: string
  marca_nombre: string
  categoria_nombre: string
  avg_gmroi: number
  avg_sellthru: number
  total_ingreso: number
  total_unidades: number
  mdi_actual: number
  imagen_url: string | null
}
