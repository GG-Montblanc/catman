import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { CategoriasList } from "./CategoriasList"
import type { CategoriaKpi } from "./CategoriasList"

export const metadata = { title: "Categorías — DBS CatMan" }

async function fetchCategoriasKpis(): Promise<CategoriaKpi[]> {
  const sb = await createClient()
  const { data, error } = await (sb.rpc as any)("get_categorias_kpis", { p_meses: 6 })
  if (error) {
    console.error("get_categorias_kpis:", error.message)
    return []
  }
  return (data as CategoriaKpi[]) ?? []
}

export default async function CategoriasPage() {
  const categorias = await fetchCategoriasKpis()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorías</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            KPIs agregados por familia de producto en los últimos 6 meses
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto shrink-0">
          {categorias.length} categorías con ventas
        </Badge>
      </div>

      {categorias.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed text-muted-foreground text-sm">
          Sin datos de ventas en los últimos 6 meses
        </div>
      ) : (
        <CategoriasList categorias={categorias} />
      )}
    </div>
  )
}
