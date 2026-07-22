import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { TiendasList } from "./TiendasList"
import type { TiendaKpi } from "./TiendasList"

export const metadata = { title: "Tiendas — DBS CatMan" }

async function fetchTiendasKpis(): Promise<TiendaKpi[]> {
  const sb = await createClient()
  const { data, error } = await (sb.rpc as any)("get_tiendas_kpis", { p_meses: 6 })
  if (error) {
    console.error("get_tiendas_kpis:", error.message)
    return []
  }
  return (data as TiendaKpi[]) ?? []
}

export default async function TiendasPage() {
  const tiendas = await fetchTiendasKpis()

  const totalIngreso = tiendas.reduce((sum, t) => sum + t.total_ingreso, 0)
  const fmtCLP = (v: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(v)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Tiendas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Performance por punto de venta en los últimos 6 meses
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary">
            {tiendas.length} tiendas con ventas
          </Badge>
          {tiendas.length > 0 && (
            <Badge variant="outline" className="tabular-nums">
              {fmtCLP(totalIngreso)} total
            </Badge>
          )}
        </div>
      </div>

      <TiendasList tiendas={tiendas} />
    </div>
  )
}
