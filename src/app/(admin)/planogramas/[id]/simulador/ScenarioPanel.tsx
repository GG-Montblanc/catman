"use client"

import { useMemo, useTransition } from "react"
import { CheckCircle, ArrowLeftRight, Undo2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { PendingSwap, SlotKpis } from "@/lib/planogram/types"
import { guardarCambios } from "./actions"

type Props = {
  planogramaId:  string
  baseKpis:      SlotKpis | null
  pendingSwaps:  Map<string, PendingSwap>
  onUndo:        (slotId: string) => void
  onClearAll:    () => void
}

function kpiDelta(curr: number | null | undefined, next: number | null | undefined) {
  if (curr == null || next == null) return null
  return next - curr
}

function DeltaRow({
  label, base, next, unit, inverse = false,
}: { label: string; base: number | null; next: number | null; unit: string; inverse?: boolean }) {
  const delta = kpiDelta(base, next)
  const improved = delta != null ? (inverse ? delta < 0 : delta > 0) : false
  const color    = delta == null ? "" : improved ? "text-emerald-600" : delta === 0 ? "" : "text-rose-600"

  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 tabular-nums">
        <span>{base?.toFixed(1) ?? "—"}{unit}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold">{next?.toFixed(1) ?? "—"}{unit}</span>
        {delta != null && Math.abs(delta) > 0.01 && (
          <span className={cn("text-xs", color)}>
            ({delta > 0 ? "+" : ""}{delta.toFixed(1)}{unit})
          </span>
        )}
      </div>
    </div>
  )
}

export function ScenarioPanel({ planogramaId, baseKpis, pendingSwaps, onUndo, onClearAll }: Props) {
  const [pending, startTransition] = useTransition()

  const swapList = useMemo(() => [...pendingSwaps.values()], [pendingSwaps])

  // Compute aggregate KPI delta from pending swaps
  const projected = useMemo(() => {
    if (swapList.length === 0 || !baseKpis) return baseKpis

    // Each pending swap contributes a delta; we approximate aggregate delta
    // as the average of per-swap deltas applied to base
    let totalDeltaGmroi = 0, totalDeltaSellthru = 0, totalDeltaMargenPct = 0, totalDeltaIngreso = 0
    let count = 0

    for (const s of swapList) {
      const origGmroi    = s.orig_kpis?.avg_gmroi      ?? 0
      const newGmroi     = s.new_kpis?.avg_gmroi       ?? 0
      const origSellthru = s.orig_kpis?.avg_sellthru   ?? 0
      const newSellthru  = s.new_kpis?.avg_sellthru    ?? 0
      const origMargen   = s.orig_kpis?.avg_margen_pct ?? 0
      const newMargen    = s.new_kpis?.avg_margen_pct  ?? 0
      const origIngreso  = s.orig_kpis?.total_ingreso  ?? 0
      const newIngreso   = s.new_kpis?.total_ingreso   ?? 0

      totalDeltaGmroi    += newGmroi    - origGmroi
      totalDeltaSellthru += newSellthru - origSellthru
      totalDeltaMargenPct += newMargen  - origMargen
      totalDeltaIngreso  += newIngreso  - origIngreso
      count++
    }

    return {
      avg_gmroi:      (baseKpis.avg_gmroi      ?? 0) + totalDeltaGmroi    / count,
      avg_sellthru:   (baseKpis.avg_sellthru   ?? 0) + totalDeltaSellthru / count,
      avg_margen_pct: (baseKpis.avg_margen_pct ?? 0) + totalDeltaMargenPct / count,
      avg_mdi:        baseKpis.avg_mdi,
      avg_fill_rate:  baseKpis.avg_fill_rate,
      total_ingreso:  (baseKpis.total_ingreso ?? 0) + totalDeltaIngreso,
      total_margen:   baseKpis.total_margen,
    } as SlotKpis
  }, [swapList, baseKpis])

  function handleApply() {
    if (!swapList.length) return
    const swaps = swapList.map(s => ({ slot_id: s.slot_id, nuevo_sku_id: s.new_sku.id }))
    startTransition(async () => {
      const result = await guardarCambios(planogramaId, swaps)
      if (result.ok) {
        toast.success(`Versión ${result.version} guardada — ${swapList.length} cambio(s) aplicado(s)`)
        onClearAll()
      } else {
        toast.error(`Error: ${result.error}`)
      }
    })
  }

  return (
    <div className="w-72 flex-shrink-0 rounded-xl border bg-card shadow-sm h-fit sticky top-4">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Escenario</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {swapList.length === 0 ? "Sin cambios pendientes" : `${swapList.length} cambio(s) pendiente(s)`}
        </p>
      </div>

      {/* KPI comparison */}
      {baseKpis && (
        <div className="px-4 py-3 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Impacto estimado
          </p>
          <DeltaRow label="GMROI"    base={baseKpis.avg_gmroi      ?? null} next={projected?.avg_gmroi      ?? null} unit="×" />
          <DeltaRow label="Sellthru" base={baseKpis.avg_sellthru   ?? null} next={projected?.avg_sellthru   ?? null} unit="%" />
          <DeltaRow label="Margen"   base={baseKpis.avg_margen_pct ?? null} next={projected?.avg_margen_pct ?? null} unit="%" />
          {baseKpis.total_ingreso != null && projected?.total_ingreso != null && (
            <div className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground">Δ Ingreso</span>
              <span className={cn(
                "font-semibold tabular-nums text-xs",
                (projected.total_ingreso - baseKpis.total_ingreso) >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>
                {projected.total_ingreso - baseKpis.total_ingreso >= 0 ? "+" : ""}
                ${((projected.total_ingreso - baseKpis.total_ingreso) / 1_000).toFixed(0)}K
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pending swaps list */}
      {swapList.length > 0 && (
        <div className="px-4 py-3 border-b max-h-60 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Cambios pendientes
          </p>
          {swapList.map(s => (
            <div key={s.slot_id} className="flex items-start gap-2 mb-2.5">
              <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--brand-magenta)] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-tight">
                  <span className="text-muted-foreground">B{s.bandeja} P{s.posicion}:</span>
                </p>
                <p className="text-xs text-muted-foreground truncate">{s.orig_sku.nombre}</p>
                <p className="text-xs font-medium truncate">→ {s.new_sku.nombre}</p>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground mt-0.5 flex-shrink-0"
                onClick={() => onUndo(s.slot_id)}
                title="Deshacer"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 space-y-2">
        <Button
          className="w-full"
          disabled={swapList.length === 0 || pending}
          onClick={handleApply}
          style={{ background: "var(--brand-magenta)", color: "white" }}
        >
          {pending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
            : <><CheckCircle className="h-4 w-4 mr-2" />Aplicar cambios</>
          }
        </Button>
        {swapList.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={onClearAll}>
            Descartar todos
          </Button>
        )}
      </div>
    </div>
  )
}
