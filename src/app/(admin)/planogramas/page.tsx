import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { LayoutGrid, ArrowRight, Plus, TrendingUp, DollarSign, BarChart2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const metadata = { title: "Planogramas — DBS Category Tracker" }

function fmtCLP(v: number | null) {
  if (v == null) return "—"
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function gmroiColor(v: number | null): string {
  if (v == null) return "text-muted-foreground"
  if (v >= 2.0)  return "text-emerald-600"
  if (v >= 1.0)  return "text-amber-600"
  return "text-rose-600"
}

function gmroiBg(v: number | null): string {
  if (v == null) return "bg-muted/40"
  if (v >= 2.0)  return "bg-emerald-50"
  if (v >= 1.0)  return "bg-amber-50"
  return "bg-rose-50"
}

type PlanogramaRow = {
  id: string
  nombre: string
  n_bandejas: number
  n_posiciones: number
  fecha_vigencia_desde: string | null
  fecha_vigencia_hasta: string | null
  tienda_id: string
  tienda_nombre: string
  tienda_ciudad: string
  categoria_nombre: string
  created_at: string
  slot_count: number
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  total_ingreso: number | null
}

export default async function PlanogramasPage() {
  const sb = await createClient()
  const { data, error } = await (sb.rpc as any)("get_planogramas_lista")

  // Fallback to basic query if RPC doesn't exist yet
  let planogramas: PlanogramaRow[] = []

  if (!error && data) {
    planogramas = data as PlanogramaRow[]
  } else {
    const { data: fallback } = await (sb as any)
      .from("planogramas")
      .select(`
        id, nombre, n_bandejas, n_posiciones, fecha_vigencia_desde, fecha_vigencia_hasta, tienda_id, created_at,
        tiendas:tienda_id (nombre, ciudad),
        categorias:categoria_id (nombre)
      `)
      .order("created_at", { ascending: false })
      .limit(100)

    planogramas = (fallback ?? []).map((p: any) => ({
      id:                   p.id,
      nombre:               p.nombre,
      n_bandejas:           p.n_bandejas,
      n_posiciones:         p.n_posiciones,
      fecha_vigencia_desde: p.fecha_vigencia_desde,
      fecha_vigencia_hasta: p.fecha_vigencia_hasta,
      tienda_id:            p.tienda_id,
      tienda_nombre:        p.tiendas?.nombre ?? "—",
      tienda_ciudad:        p.tiendas?.ciudad ?? "",
      categoria_nombre:     p.categorias?.nombre ?? "—",
      created_at:           p.created_at,
      slot_count:           0,
      avg_gmroi:            null,
      avg_sellthru:         null,
      avg_margen_pct:       null,
      total_ingreso:        null,
    }))
  }

  // Group by tienda for quick stats
  const tiendaCount = new Set(planogramas.map(p => p.tienda_id)).size

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planogramas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {planogramas.length} planograma{planogramas.length !== 1 ? "s" : ""} en {tiendaCount} tienda{tiendaCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button asChild style={{ background: "var(--brand-magenta)", color: "#fff" }}>
          <Link href="/planogramas/nuevo">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo planograma
          </Link>
        </Button>
      </div>

      {!planogramas.length ? (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <LayoutGrid className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <div>
            <p className="font-semibold">Sin planogramas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ejecuta <code className="bg-muted px-1 rounded text-xs">npm run seed:planogramas</code> para generar planogramas demo.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planogramas.map(p => (
            <PlanogramaCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanogramaCard({ p }: { p: PlanogramaRow }) {
  const hasKpis = p.avg_gmroi != null || p.avg_sellthru != null || p.total_ingreso != null

  const vigencia = (() => {
    if (!p.fecha_vigencia_desde && !p.fecha_vigencia_hasta) return null
    const fmt = (d: string | null) => {
      if (!d) return "?"
      return new Date(d + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
    }
    if (p.fecha_vigencia_hasta) return `${fmt(p.fecha_vigencia_desde)} → ${fmt(p.fecha_vigencia_hasta)}`
    return `Desde ${fmt(p.fecha_vigencia_desde)}`
  })()

  return (
    <div className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-all hover:border-[oklch(0.62_0.20_358/0.4)] flex flex-col">
      {/* ── GMROI header bar ──────────────────────────────────────────────────── */}
      <div className={cn("px-4 pt-4 pb-3 flex items-start justify-between", gmroiBg(p.avg_gmroi))}>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white/70 backdrop-blur flex items-center justify-center shrink-0">
            <LayoutGrid className="h-4.5 w-4.5 text-[var(--brand-magenta)]" style={{ height: "1.125rem", width: "1.125rem" }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight line-clamp-2">{p.nombre}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {p.tienda_nombre} · {p.tienda_ciudad}
            </p>
          </div>
        </div>
        {/* GMROI badge */}
        {p.avg_gmroi != null && (
          <div className={cn("shrink-0 text-right ml-2")}>
            <p className={cn("text-lg font-bold tabular-nums leading-none", gmroiColor(p.avg_gmroi))}>
              {p.avg_gmroi.toFixed(2)}×
            </p>
            <p className="text-[10px] text-muted-foreground">GMROI</p>
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-3">
        {/* Category + size */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-normal">{p.categoria_nombre}</Badge>
          <span className="text-xs text-muted-foreground">
            {p.n_bandejas}B × {p.n_posiciones}P
          </span>
          {p.slot_count > 0 && (
            <span className="text-xs text-muted-foreground">
              · {p.slot_count} SKU{p.slot_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* KPI mini-row */}
        {hasKpis && (
          <div className="grid grid-cols-3 gap-1.5">
            <KpiMini
              icon={<BarChart2 className="h-3 w-3" />}
              label="Sellthru"
              value={p.avg_sellthru != null ? `${p.avg_sellthru.toFixed(1)}%` : "—"}
            />
            <KpiMini
              icon={<TrendingUp className="h-3 w-3" />}
              label="Margen"
              value={p.avg_margen_pct != null ? `${p.avg_margen_pct.toFixed(1)}%` : "—"}
            />
            <KpiMini
              icon={<DollarSign className="h-3 w-3" />}
              label="Ingreso"
              value={fmtCLP(p.total_ingreso)}
            />
          </div>
        )}

        {/* Vigencia */}
        {vigencia && (
          <p className="text-[11px] text-muted-foreground">📅 {vigencia}</p>
        )}
      </div>

      {/* ── Footer actions ────────────────────────────────────────────────────── */}
      <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/20 gap-2">
        <Link
          href={`/planogramas/${p.id}/editor`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Editor
        </Link>
        <Link
          href={`/planogramas/${p.id}/pedido`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          🛒 Pedido
        </Link>
        <Link
          href={`/planogramas/${p.id}/simulador`}
          className="flex items-center gap-1 text-xs font-medium text-[var(--brand-magenta)] hover:opacity-80 transition-opacity"
        >
          Simulador <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}

function KpiMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5 flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </div>
  )
}
