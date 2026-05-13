"use client"

import { useState, useCallback, useMemo } from "react"
import {
  BarChart2, Eye, TrendingUp, DollarSign,
  ExternalLink, Layers, ShoppingCart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ShelfSVG } from "./ShelfSVG"
import { SkuSwapDialog } from "./SkuSwapDialog"
import { ScenarioPanel } from "./ScenarioPanel"
import { PublicarButton } from "./PublicarButton"
import { VersionHistorySheet } from "./VersionHistorySheet"
import type { PlanogramData, PlanogramSlot, SlotKpis, PendingSwap } from "@/lib/planogram/types"
import type { HeatmapLayer } from "@/lib/heatmap/colorScale"
import Link from "next/link"

const LAYERS: { id: HeatmapLayer; label: string; icon: React.ElementType; description: string }[] = [
  { id: "gmroi",    label: "GMROI",    icon: BarChart2,  description: "Retorno sobre inventario" },
  { id: "sellthru", label: "Sellthru", icon: TrendingUp, description: "% unidades vendidas" },
  { id: "mdi",      label: "MDI",      icon: Eye,        description: "Meses de inventario" },
  { id: "ingreso",  label: "Ingreso",  icon: DollarSign, description: "Ingreso total $" },
]

function fmtCLP(v: number | null) {
  if (v == null) return "—"
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

type KpiStatProps = { label: string; value: string; sub?: string; highlight?: boolean }
function KpiStat({ label, value, sub, highlight }: KpiStatProps) {
  return (
    <div className={cn(
      "flex flex-col px-4 py-2.5 border-r last:border-r-0",
      highlight && "bg-[oklch(0.97_0.01_358)]"
    )}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-base font-bold tabular-nums leading-tight", highlight && "text-[var(--brand-magenta)]")}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

type Props = { planograma: PlanogramData }

export function SimuladorClient({ planograma }: Props) {
  const [layer, setLayer]               = useState<HeatmapLayer>("gmroi")
  const [openSwap, setOpenSwap]         = useState(false)
  const [activeSlot, setActiveSlot]     = useState<PlanogramSlot | null>(null)
  const [activeKpis, setActiveKpis]     = useState<SlotKpis | null>(null)
  const [pendingSwaps, setPendingSwaps] = useState<Map<string, PendingSwap>>(new Map())

  const handleSlotClick = useCallback((slot: PlanogramSlot, kpis: SlotKpis | null) => {
    setActiveSlot(slot)
    setActiveKpis(kpis)
    setOpenSwap(true)
  }, [])

  const handleSwapConfirm = useCallback((swap: PendingSwap) => {
    setPendingSwaps(prev => {
      const next = new Map(prev)
      next.set(swap.slot_id, swap)
      return next
    })
  }, [])

  const handleUndo = useCallback((slotId: string) => {
    setPendingSwaps(prev => {
      const next = new Map(prev)
      next.delete(slotId)
      return next
    })
  }, [])

  const handleClearAll = useCallback(() => setPendingSwaps(new Map()), [])

  // KPI stats (with pending swaps applied for real-time delta)
  const kpis = planograma.kpis_resumen
  const totalSlots   = planograma.slots.length
  const filledSlots  = planograma.slots.filter(s => s.sku).length
  const pendingCount = pendingSwaps.size

  // Quick GMROI distribution
  const gmroiDist = useMemo(() => {
    let green = 0, yellow = 0, red = 0
    for (const s of planograma.slots) {
      const g = s.kpis?.avg_gmroi ?? null
      if (g == null) continue
      if (g >= 2.0) green++
      else if (g >= 1.0) yellow++
      else red++
    }
    return { green, yellow, red }
  }, [planograma.slots])

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{planograma.nombre}</h2>
            {pendingCount > 0 && (
              <span className="rounded-full bg-[oklch(0.62_0.20_358)] text-white text-xs px-2 py-0.5 font-semibold">
                {pendingCount} cambio{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            🏬 {planograma.tienda.nombre} · {planograma.tienda.ciudad} &nbsp;·&nbsp;
            🏷️ {planograma.categoria.nombre} &nbsp;·&nbsp;
            {planograma.n_bandejas} bandejas × {planograma.n_posiciones} posiciones
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
            <Link href={`/planogramas/${planograma.id}/pedido`}>
              <ShoppingCart className="h-3.5 w-3.5" />
              Pedido
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
            <Link href={`/planogramas/${planograma.id}/editor`}>
              <Layers className="h-3.5 w-3.5" />
              Editor
            </Link>
          </Button>
          <VersionHistorySheet planogramaId={planograma.id} />
          <PublicarButton planogramaId={planograma.id} />
        </div>
      </div>

      {/* ── KPI Stats bar ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 divide-x divide-y sm:divide-y-0">
          <KpiStat
            label="GMROI promedio"
            value={kpis?.avg_gmroi != null ? `${kpis.avg_gmroi.toFixed(2)}×` : "—"}
            highlight
          />
          <KpiStat
            label="Sellthru"
            value={kpis?.avg_sellthru != null ? `${kpis.avg_sellthru.toFixed(1)}%` : "—"}
          />
          <KpiStat
            label="Margen"
            value={kpis?.avg_margen_pct != null ? `${kpis.avg_margen_pct.toFixed(1)}%` : "—"}
          />
          <KpiStat
            label="Ingreso total"
            value={fmtCLP(kpis?.total_ingreso ?? null)}
          />
          <KpiStat
            label="SKUs en estante"
            value={`${filledSlots} / ${totalSlots}`}
            sub={`${planograma.n_bandejas}B × ${planograma.n_posiciones}P`}
          />
          <div className="flex flex-col px-4 py-2.5">
            <span className="text-xs text-muted-foreground mb-1">GMROI dist.</span>
            <div className="flex items-center gap-1 text-xs">
              <span className="rounded-sm bg-emerald-100 text-emerald-800 px-1.5 py-0.5 font-semibold tabular-nums">{gmroiDist.green}</span>
              <span className="rounded-sm bg-amber-100 text-amber-800 px-1.5 py-0.5 font-semibold tabular-nums">{gmroiDist.yellow}</span>
              <span className="rounded-sm bg-rose-100 text-rose-800 px-1.5 py-0.5 font-semibold tabular-nums">{gmroiDist.red}</span>
              <span className="text-muted-foreground text-[10px] ml-1">alto/med/bajo</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Layer selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Ver por:</span>
          <div className="flex rounded-lg border p-0.5 bg-muted gap-0.5">
            {LAYERS.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                onClick={() => setLayer(id)}
                title={description}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  layer === id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Hover</span> para ver KPIs ·{" "}
          <span className="font-medium text-foreground">Click</span> para reemplazar SKU
        </p>
      </div>

      {/* ── Main: shelf + scenario panel ───────────────────────────────────── */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <ShelfSVG
            slots={planograma.slots}
            nBandejas={planograma.n_bandejas}
            nPosiciones={planograma.n_posiciones}
            layer={layer}
            pendingSwaps={pendingSwaps}
            onSlotClick={handleSlotClick}
          />
        </div>

        <ScenarioPanel
          planogramaId={planograma.id}
          baseKpis={planograma.kpis_resumen}
          pendingSwaps={pendingSwaps}
          onUndo={handleUndo}
          onClearAll={handleClearAll}
        />
      </div>

      {/* ── SKU Swap Dialog ─────────────────────────────────────────────────── */}
      <SkuSwapDialog
        slot={activeSlot}
        currentKpis={activeKpis}
        planogramaId={planograma.id}
        open={openSwap}
        onClose={() => setOpenSwap(false)}
        onConfirm={handleSwapConfirm}
      />
    </div>
  )
}
