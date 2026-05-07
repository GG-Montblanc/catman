import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { LayoutGrid, ArrowRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "Planogramas — DBS Category Tracker" }

export default async function PlanogramasPage() {
  const sb = await createClient()
  const { data: planogramasRaw } = await (sb as any)
    .from("planogramas")
    .select(`
      id, nombre, n_bandejas, n_posiciones, fecha_vigencia_desde, fecha_vigencia_hasta,
      tiendas:tienda_id (nombre, ciudad),
      categorias:categoria_id (nombre)
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  type PRow = {
    id: string; nombre: string; n_bandejas: number; n_posiciones: number
    fecha_vigencia_desde: string | null; fecha_vigencia_hasta: string | null
    tiendas: { nombre: string; ciudad: string } | null
    categorias: { nombre: string } | null
  }
  const planogramas: PRow[] | null = planogramasRaw

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planogramas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Simulador visual de estante con heatmap GMROI y swap de SKUs
          </p>
        </div>
        <Button asChild style={{ background: "var(--brand-magenta)", color: "#fff" }}>
          <Link href="/planogramas/nuevo">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo planograma
          </Link>
        </Button>
      </div>

      {!planogramas?.length ? (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <LayoutGrid className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="font-semibold">Sin planogramas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ejecuta <code className="bg-muted px-1 rounded text-xs">npm run seed:planogramas</code> para generar planogramas demo desde los datos sintéticos.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {planogramas.map(p => {
            const tienda    = p.tiendas
            const categoria = p.categorias
            return (
              <Link
                key={p.id}
                href={`/planogramas/${p.id}/simulador`}
                className="group rounded-xl border bg-card p-5 hover:shadow-md transition-all hover:border-[oklch(0.62_0.20_358/0.5)]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-lg bg-[oklch(0.97_0.02_358)] flex items-center justify-center">
                    <LayoutGrid className="h-5 w-5 text-[var(--brand-magenta)]" />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {categoria?.nombre ?? "—"}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm leading-tight mb-0.5 line-clamp-2">{p.nombre}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {tienda?.nombre ?? "—"} · {tienda?.ciudad ?? ""}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {p.n_bandejas}B × {p.n_posiciones}P
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-[var(--brand-magenta)] opacity-0 group-hover:opacity-100 transition-opacity">
                    Ver simulador <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
