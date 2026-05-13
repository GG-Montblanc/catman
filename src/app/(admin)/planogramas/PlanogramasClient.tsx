"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { LayoutGrid, ArrowRight, Plus, TrendingUp, DollarSign, BarChart2, Search, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { PlanogramaRow } from "./page"

// ─── Formatters ───────────────────────────────────────────────────────────────

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
  if (v == null) return "bg-muted/30"
  if (v >= 2.0)  return "bg-emerald-50 dark:bg-emerald-950/30"
  if (v >= 1.0)  return "bg-amber-50 dark:bg-amber-950/30"
  return "bg-rose-50 dark:bg-rose-950/30"
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  planogramas: PlanogramaRow[]
}

export function PlanogramasClient({ planogramas }: Props) {
  const [buscar, setBuscar]           = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState("all")
  const [filtroTienda, setFiltroTienda]       = useState("all")
  const [agrupar, setAgrupar]         = useState(true)

  // Unique options
  const categorias = useMemo(() =>
    [...new Set(planogramas.map(p => p.categoria_nombre))].sort(),
    [planogramas]
  )
  const tiendas = useMemo(() =>
    [...new Map(planogramas.map(p => [p.tienda_id, p.tienda_nombre])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])),
    [planogramas]
  )

  // Filtered
  const filtered = useMemo(() => {
    const q = buscar.toLowerCase()
    return planogramas.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) &&
          !p.tienda_nombre.toLowerCase().includes(q) &&
          !p.categoria_nombre.toLowerCase().includes(q)) return false
      if (filtroCategoria !== "all" && p.categoria_nombre !== filtroCategoria) return false
      if (filtroTienda !== "all" && p.tienda_id !== filtroTienda) return false
      return true
    })
  }, [planogramas, buscar, filtroCategoria, filtroTienda])

  // Group by tienda
  const grouped = useMemo(() => {
    if (!agrupar) return null
    const map = new Map<string, { tienda_nombre: string; tienda_ciudad: string; items: PlanogramaRow[] }>()
    for (const p of filtered) {
      if (!map.has(p.tienda_id)) {
        map.set(p.tienda_id, { tienda_nombre: p.tienda_nombre, tienda_ciudad: p.tienda_ciudad, items: [] })
      }
      map.get(p.tienda_id)!.items.push(p)
    }
    return [...map.values()].sort((a, b) => a.tienda_nombre.localeCompare(b.tienda_nombre))
  }, [filtered, agrupar])

  const tiendaCount = new Set(planogramas.map(p => p.tienda_id)).size

  return (
    <div className="space-y-5">
      {/* Header */}
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

      {/* Filters */}
      {planogramas.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48 max-w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar planograma…"
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categorias.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroTienda} onValueChange={setFiltroTienda}>
            <SelectTrigger className="w-52 h-9">
              <SelectValue placeholder="Todas las tiendas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las tiendas</SelectItem>
              {tiendas.map(([id, nombre]) => (
                <SelectItem key={id} value={id}>{nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => setAgrupar(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              agrupar
                ? "bg-[oklch(0.62_0.20_358/0.08)] border-[oklch(0.62_0.20_358/0.3)] text-[var(--brand-magenta)]"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {agrupar ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Agrupar por tienda
          </button>

          {(buscar || filtroCategoria !== "all" || filtroTienda !== "all") && (
            <span className="text-xs text-muted-foreground">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
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
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Sin resultados para los filtros seleccionados.</p>
        </div>
      ) : agrupar && grouped ? (
        // Grouped view
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.tienda_nombre}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold text-sm">{group.tienda_nombre}</h2>
                <span className="text-xs text-muted-foreground">{group.tienda_ciudad}</span>
                <Badge variant="outline" className="text-xs ml-1">
                  {group.items.length} planograma{group.items.length !== 1 ? "s" : ""}
                </Badge>
                {/* Avg GMROI for this store */}
                {(() => {
                  const withGmroi = group.items.filter(p => p.avg_gmroi != null)
                  if (!withGmroi.length) return null
                  const avg = withGmroi.reduce((s, p) => s + p.avg_gmroi!, 0) / withGmroi.length
                  return (
                    <span className={cn("text-xs font-semibold tabular-nums ml-auto", gmroiColor(avg))}>
                      GMROI prom. {avg.toFixed(2)}×
                    </span>
                  )
                })()}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map(p => (
                  <PlanogramaCard key={p.id} p={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat grid
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <PlanogramaCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PlanogramaCard({ p }: { p: PlanogramaRow }) {
  const hasKpis = p.avg_gmroi != null || p.avg_sellthru != null || p.total_ingreso != null

  const vigencia = (() => {
    if (!p.fecha_vigencia_desde && !p.fecha_vigencia_hasta) return null
    const fmt = (d: string | null) => {
      if (!d) return "?"
      return new Date(d + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })
    }
    if (p.fecha_vigencia_hasta) return `${fmt(p.fecha_vigencia_desde)} → ${fmt(p.fecha_vigencia_hasta)}`
    return `Desde ${fmt(p.fecha_vigencia_desde)}`
  })()

  return (
    <div className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-all hover:border-[oklch(0.62_0.20_358/0.4)] flex flex-col">
      {/* Header con color por GMROI */}
      <div className={cn("px-4 pt-3.5 pb-3 flex items-start justify-between", gmroiBg(p.avg_gmroi))}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-white/70 backdrop-blur flex items-center justify-center shrink-0">
            <LayoutGrid className="h-4 w-4 text-[var(--brand-magenta)]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight line-clamp-2">{p.nombre}</p>
            {/* Only show tienda when NOT in grouped mode — but card doesn't know. Show always for simplicity */}
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {p.tienda_ciudad}
            </p>
          </div>
        </div>
        {p.avg_gmroi != null && (
          <div className="shrink-0 text-right ml-2">
            <p className={cn("text-lg font-bold tabular-nums leading-none", gmroiColor(p.avg_gmroi))}>
              {p.avg_gmroi.toFixed(2)}×
            </p>
            <p className="text-[10px] text-muted-foreground">GMROI</p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-normal capitalize">
            {p.categoria_nombre}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {p.n_bandejas}B × {p.n_posiciones}P
          </span>
          {p.slot_count > 0 && (
            <span className="text-xs text-muted-foreground">· {p.slot_count} SKUs</span>
          )}
          {p.n_tiendas_asignadas != null && p.n_tiendas_asignadas > 0 && (
            <span className="text-xs font-medium text-[var(--brand-magenta)]">
              · 🏬 {p.n_tiendas_asignadas}
            </span>
          )}
        </div>

        {hasKpis && (
          <div className="grid grid-cols-3 gap-1.5">
            <KpiMini icon={<BarChart2 className="h-3 w-3" />} label="Sellthru"
              value={p.avg_sellthru != null ? `${p.avg_sellthru.toFixed(1)}%` : "—"} />
            <KpiMini icon={<TrendingUp className="h-3 w-3" />} label="Margen"
              value={p.avg_margen_pct != null ? `${p.avg_margen_pct.toFixed(1)}%` : "—"} />
            <KpiMini icon={<DollarSign className="h-3 w-3" />} label="Ingreso"
              value={fmtCLP(p.total_ingreso)} />
          </div>
        )}

        {vigencia && (
          <p className="text-[11px] text-muted-foreground">📅 {vigencia}</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 flex items-center justify-between bg-muted/20 gap-2">
        <Link href={`/planogramas/${p.id}/editor`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Editor
        </Link>
        <Link href={`/planogramas/${p.id}/pedido`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          🛒 Pedido
        </Link>
        <Link href={`/planogramas/${p.id}/simulador`}
          className="flex items-center gap-1 text-xs font-medium text-[var(--brand-magenta)] hover:opacity-80 transition-opacity">
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
