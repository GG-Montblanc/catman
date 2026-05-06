"use client"

import { useState, useCallback } from "react"
import { BarChart2, Eye, TrendingUp, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ShelfSVG } from "./ShelfSVG"
import { SkuSwapDialog } from "./SkuSwapDialog"
import { ScenarioPanel } from "./ScenarioPanel"
import type { PlanogramData, PlanogramSlot, SlotKpis, PendingSwap } from "@/lib/planogram/types"
import type { HeatmapLayer } from "@/lib/heatmap/colorScale"

const LAYERS: { id: HeatmapLayer; label: string; icon: React.ElementType }[] = [
  { id: "gmroi",    label: "GMROI",    icon: BarChart2   },
  { id: "sellthru", label: "Sellthru", icon: TrendingUp  },
  { id: "mdi",      label: "MDI",      icon: Eye         },
  { id: "ingreso",  label: "Ingreso",  icon: DollarSign  },
]

type Props = {
  planograma: PlanogramData
}

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

  const handleClearAll = useCallback(() => {
    setPendingSwaps(new Map())
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{planograma.nombre}</h2>
          <p className="text-xs text-muted-foreground">
            {planograma.tienda.nombre} · {planograma.n_bandejas} bandejas × {planograma.n_posiciones} posiciones
          </p>
        </div>

        {/* Layer toggle */}
        <div className="flex rounded-lg border p-0.5 bg-muted gap-0.5">
          {LAYERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setLayer(id)}
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

      {/* Main area: shelf + scenario panel */}
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
          <p className="text-xs text-muted-foreground mt-2">
            Click en cualquier slot para reemplazar el SKU.
            <span className="text-[var(--brand-magenta)] font-medium"> B2–B3 = nivel visual (eye-level).</span>
          </p>
        </div>

        <ScenarioPanel
          planogramaId={planograma.id}
          baseKpis={planograma.kpis_resumen}
          pendingSwaps={pendingSwaps}
          onUndo={handleUndo}
          onClearAll={handleClearAll}
        />
      </div>

      {/* SKU Swap Dialog */}
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
