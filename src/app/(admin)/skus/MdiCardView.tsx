"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Download, Search, AlertTriangle, CheckSquare, Square } from "lucide-react"
import Papa from "papaparse"
import type { SkuConKpis } from "@/lib/kpi/types"

// ─── MDI Ranges ────────────────────────────────────────────────────────────────
type MdiRange = "all" | "green" | "yellow" | "orange" | "red"

const MDI_RANGES: {
  id: MdiRange
  label: string
  desc: string
  borderClass: string
  headerClass: string
  badgeClass: string
}[] = [
  {
    id: "green",
    label: "Sano",
    desc: "MDI < 3m",
    borderClass: "border-emerald-200",
    headerClass: "bg-emerald-50",
    badgeClass: "bg-emerald-100 text-emerald-800",
  },
  {
    id: "yellow",
    label: "Moderado",
    desc: "3–6m",
    borderClass: "border-amber-200",
    headerClass: "bg-amber-50",
    badgeClass: "bg-amber-100 text-amber-800",
  },
  {
    id: "orange",
    label: "Alto",
    desc: "6–12m",
    borderClass: "border-orange-300",
    headerClass: "bg-orange-50",
    badgeClass: "bg-orange-100 text-orange-800",
  },
  {
    id: "red",
    label: "Crítico",
    desc: "> 12m",
    borderClass: "border-rose-300",
    headerClass: "bg-rose-50",
    badgeClass: "bg-rose-100 text-rose-800",
  },
]

function getMdiRange(mdi: number | null): Exclude<MdiRange, "all"> {
  if (mdi == null || mdi < 3)  return "green"
  if (mdi < 6)  return "yellow"
  if (mdi < 12) return "orange"
  return "red"
}

function fmtCLP(v: number | null) {
  if (v == null) return "—"
  return new Intl.NumberFormat("es-CL", {
    style: "currency", currency: "CLP", maximumFractionDigits: 0,
  }).format(v)
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchMdiSkus(buscar: string): Promise<SkuConKpis[]> {
  const sb = createClient()
  const { data, error } = await (sb.rpc as any)("get_skus_con_kpis", {
    p_buscar: buscar || null,
    p_orden:  "mdi_desc",
    p_offset: 0,
    p_limit:  200,
  })
  if (error) throw error
  return (data as { skus: SkuConKpis[] }).skus ?? []
}

// ─── Single SKU Card ───────────────────────────────────────────────────────────
function MdiCard({
  sku,
  selected,
  onToggle,
}: {
  sku: SkuConKpis
  selected: boolean
  onToggle: () => void
}) {
  const range = getMdiRange(sku.avg_mdi_meses)
  const cfg   = MDI_RANGES.find(r => r.id === range)!

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 bg-card overflow-hidden cursor-pointer transition-all hover:shadow-md",
        cfg.borderClass,
        selected && "ring-2 ring-[var(--brand-magenta)] ring-offset-1",
      )}
      onClick={onToggle}
    >
      {/* Selection checkbox */}
      <div
        className="absolute top-2 right-2 z-10"
        onClick={e => { e.stopPropagation(); onToggle() }}
      >
        {selected
          ? <CheckSquare className="h-4 w-4 text-[var(--brand-magenta)]" />
          : <Square className="h-4 w-4 text-muted-foreground/40" />
        }
      </div>

      {/* Image + MDI header */}
      <div className={cn("px-3 pt-3 pb-2 flex items-start gap-2.5", cfg.headerClass)}>
        <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-white/60 shrink-0">
          {sku.imagen_url ? (
            <Image
              src={sku.imagen_url}
              alt={sku.nombre}
              fill
              className="object-contain p-0.5"
              unoptimized
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground/30 text-xs">—</div>
          )}
        </div>

        {/* MDI badge (large) */}
        <div className="flex-1 min-w-0 pr-5">
          <p className="text-xs font-medium text-muted-foreground truncate">
            {sku.marca_nombre ?? "—"}
          </p>
          <div className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 mt-1.5", cfg.badgeClass)}>
            {(range === "red" || range === "orange") && (
              <AlertTriangle className="h-3 w-3 shrink-0" />
            )}
            <span className="text-base font-bold tabular-nums leading-none">
              {sku.avg_mdi_meses != null ? sku.avg_mdi_meses.toFixed(1) : "—"}
            </span>
            <span className="text-xs font-medium">meses</span>
          </div>
        </div>
      </div>

      {/* Product name */}
      <div className="px-3 py-2">
        <p className="text-xs font-semibold leading-snug line-clamp-2">{sku.nombre}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {sku.categoria_nombre ?? "—"}
        </p>
      </div>

      {/* KPI mini-row */}
      <div className="grid grid-cols-3 divide-x border-t text-center">
        <KpiMini label="GMROI" value={sku.avg_gmroi != null ? `${sku.avg_gmroi.toFixed(2)}×` : "—"} />
        <KpiMini label="Sellthru" value={sku.avg_sellthru_pct != null ? `${sku.avg_sellthru_pct.toFixed(0)}%` : "—"} />
        <KpiMini label="Precio" value={fmtCLP(sku.precio_lista)} />
      </div>
    </div>
  )
}

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  )
}

// ─── Main MDI card view ────────────────────────────────────────────────────────
export function MdiCardView() {
  const [buscar, setBuscar]       = useState("")
  const [debouncedBuscar, setDebouncedBuscar] = useState("")
  const [rangeFilter, setRange]   = useState<MdiRange>("all")
  const [selected, setSelected]   = useState<Set<string>>(new Set())

  const handleSearch = (v: string) => {
    setBuscar(v)
    clearTimeout((handleSearch as any)._t)
    ;(handleSearch as any)._t = setTimeout(() => {
      setDebouncedBuscar(v)
    }, 300)
  }

  const { data: allSkus = [], isLoading } = useQuery({
    queryKey: ["skus_mdi", debouncedBuscar],
    queryFn:  () => fetchMdiSkus(debouncedBuscar),
    staleTime: 3 * 60 * 1000,
  })

  // Filter by range
  const filtered = useMemo(() => {
    if (rangeFilter === "all") return allSkus
    return allSkus.filter(s => getMdiRange(s.avg_mdi_meses) === rangeFilter)
  }, [allSkus, rangeFilter])

  // Range counts
  const counts = useMemo(() => {
    const c: Record<MdiRange, number> = { all: 0, green: 0, yellow: 0, orange: 0, red: 0 }
    for (const s of allSkus) {
      const r = getMdiRange(s.avg_mdi_meses)
      c[r]++
      c.all++
    }
    return c
  }, [allSkus])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(s => s.id)))
    }
  }

  function exportCsv() {
    const toExport = selected.size > 0
      ? allSkus.filter(s => selected.has(s.id))
      : filtered

    const rows = toExport.map(s => ({
      SKU:             s.nombre,
      Marca:           s.marca_nombre ?? "",
      Categoría:       s.categoria_nombre ?? "",
      "MDI (meses)":   s.avg_mdi_meses?.toFixed(1) ?? "",
      "Rango MDI":     getMdiRange(s.avg_mdi_meses),
      "GMROI":         s.avg_gmroi?.toFixed(2) ?? "",
      "Sellthru %":    s.avg_sellthru_pct?.toFixed(1) ?? "",
      "Precio lista":  s.precio_lista ?? "",
    }))
    const csv = Papa.unparse(rows)
    const a   = document.createElement("a")
    a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    a.download = `mdi_${rangeFilter}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52 max-w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar SKU o marca..."
            value={buscar}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Selection controls */}
        {filtered.length > 0 && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            onClick={toggleAll}
          >
            {selected.size === filtered.length
              ? <CheckSquare className="h-3.5 w-3.5 text-[var(--brand-magenta)]" />
              : <Square className="h-3.5 w-3.5" />
            }
            {selected.size === filtered.length ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
        )}

        {/* Export */}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          {selected.size > 0
            ? `Exportar ${selected.size} seleccionado${selected.size !== 1 ? "s" : ""}`
            : "Exportar CSV"
          }
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} SKU{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Range filter chips ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Inventario:</span>

        <button
          onClick={() => setRange("all")}
          className={cn(
            "text-xs rounded-full px-3 py-1 border font-medium transition-all",
            rangeFilter === "all"
              ? "bg-foreground text-background border-foreground"
              : "bg-card hover:border-foreground/40",
          )}
        >
          Todos
          <span className="ml-1.5 tabular-nums">{counts.all}</span>
        </button>

        {MDI_RANGES.map(r => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={cn(
              "text-xs rounded-full px-3 py-1 border font-medium transition-all",
              rangeFilter === r.id
                ? cn("border-transparent", r.badgeClass)
                : "bg-card hover:border-foreground/40",
            )}
          >
            {r.label} · {r.desc}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[r.id]}</span>
          </button>
        ))}
      </div>

      {/* ── Card grid ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center rounded-xl border bg-card">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium">Sin SKUs en este rango</p>
            <p className="text-xs text-muted-foreground mt-1">
              {debouncedBuscar ? `Sin resultados para "${debouncedBuscar}"` : "No hay SKUs con el filtro seleccionado"}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map(sku => (
            <MdiCard
              key={sku.id}
              sku={sku}
              selected={selected.has(sku.id)}
              onToggle={() => toggleSelect(sku.id)}
            />
          ))}
        </div>
      )}

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 pt-2 border-t">
        <span className="text-[11px] text-muted-foreground self-center">Referencia MDI:</span>
        {MDI_RANGES.map(r => (
          <div key={r.id} className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", r.badgeClass)}>
            {r.label} ({r.desc})
          </div>
        ))}
      </div>
    </div>
  )
}
