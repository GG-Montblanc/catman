import { createClient } from "@/lib/supabase/server"
import { OptimizacionClient } from "./OptimizacionClient"

export const metadata = { title: "Optimización — DBS CatMan" }

export default async function OptimizacionPage() {
  const sb = await createClient()

  const [cuadranteRes, tiendasRes, categoriasRes, espacioMarcaRes] = await Promise.all([
    (sb.rpc as any)("get_optimizacion_cuadrante", {}),
    sb.from("tiendas").select("id, nombre").eq("activa", true).order("nombre"),
    sb.from("categorias").select("id, nombre").lte("nivel", 2).order("nombre"),
    (sb.rpc as any)("get_espacio_marca", {}),
  ])

  const cuadrante = (cuadranteRes.data ?? []) as CuadranteRow[]
  const tiendas   = (tiendasRes.data   ?? []) as { id: string; nombre: string }[]
  const categorias = (categoriasRes.data ?? []) as { id: string; nombre: string }[]
  const espacioMarca = (espacioMarcaRes.data ?? []) as EspacioMarcaRow[]
  const espacioMarcaTotalSlots = espacioMarca.reduce((acc, r) => acc + (r.slots_actuales ?? 0), 0)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Optimización</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Qué y cuándo comprar, pedido por marca, y análisis de portafolio
        </p>
      </div>
      <OptimizacionClient
        cuadrante={cuadrante}
        tiendas={tiendas}
        categorias={categorias}
        espacioMarca={espacioMarca}
        espacioMarcaTotalSlots={espacioMarcaTotalSlots}
      />
    </div>
  )
}

export type EspacioMarcaRow = {
  marca_id: string
  marca_nombre: string
  slots_actuales: number
  pct_espacio: number
  total_ingreso: number
  pct_ventas: number
  avg_gmroi: number
  slots_optimos: number
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
