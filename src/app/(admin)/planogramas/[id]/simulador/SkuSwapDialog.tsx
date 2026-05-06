"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Image from "next/image"
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { PlanogramSlot, SwapCandidate, SlotKpis, PendingSwap, PlanogramSku } from "@/lib/planogram/types"

type Props = {
  slot:          PlanogramSlot | null
  currentKpis:   SlotKpis | null
  planogramaId:  string
  open:          boolean
  onClose:       () => void
  onConfirm:     (swap: PendingSwap) => void
}

async function fetchCandidates(
  skuId: string,
  planogramaId: string,
  modo: string
): Promise<{ current_kpis: SlotKpis | null; candidatos: SwapCandidate[] }> {
  const sb = createClient()
  const { data, error } = await (sb.rpc as any)("get_swap_candidatos", {
    p_sku_id:        skuId,
    p_planograma_id: planogramaId,
    p_modo:          modo,
    p_limit:         20,
  })
  if (error) throw error
  return data ?? { current_kpis: null, candidatos: [] }
}

function DeltaBadge({ delta, inverse = false, unit = "" }: { delta: number | null; inverse?: boolean; unit?: string }) {
  if (delta == null) return <span className="text-muted-foreground text-xs">—</span>
  const positive = inverse ? delta < 0 : delta > 0
  const zero = Math.abs(delta) < 0.01
  if (zero) return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" />0
    </span>
  )
  return (
    <span className={cn(
      "flex items-center gap-0.5 text-xs font-semibold",
      positive ? "text-emerald-600" : "text-rose-600"
    )}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}{unit}
    </span>
  )
}

export function SkuSwapDialog({ slot, currentKpis, planogramaId, open, onClose, onConfirm }: Props) {
  const [modo, setModo]         = useState<"categoria" | "marca">("categoria")
  const [selected, setSelected] = useState<SwapCandidate | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["swap_candidatos", slot?.id, modo],
    queryFn:  () => fetchCandidates(slot!.sku.id, planogramaId, modo),
    enabled:  !!slot && open,
    staleTime: 3 * 60 * 1000,
  })

  const candidates = data?.candidatos ?? []

  function handleConfirm() {
    if (!slot || !selected) return
    const newSku: PlanogramSku = {
      id:           selected.id,
      nombre:       selected.nombre,
      sku_externo:  selected.sku_externo,
      imagen_url:   selected.imagen_url,
      precio_lista: selected.precio_lista,
      marca_nombre: selected.marca_nombre,
      categoria_id: slot.sku.categoria_id,
    }
    const newKpis: SlotKpis = {
      avg_gmroi:      selected.avg_gmroi,
      avg_sellthru:   selected.avg_sellthru,
      avg_margen_pct: selected.avg_margen_pct,
      avg_mdi:        selected.avg_mdi,
      avg_fill_rate:  null,
      total_ingreso:  selected.total_ingreso,
      total_margen:   selected.total_margen,
    }
    onConfirm({
      slot_id:   slot.id,
      bandeja:   slot.bandeja,
      posicion:  slot.posicion,
      orig_sku:  slot.sku,
      orig_kpis: currentKpis,
      new_sku:   newSku,
      new_kpis:  newKpis,
    })
    setSelected(null)
    onClose()
  }

  if (!slot) return null

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-[var(--brand-magenta)]" />
            Reemplazar SKU — Bandeja {slot.bandeja}, Pos. {slot.posicion}
          </DialogTitle>
        </DialogHeader>

        {/* Current SKU info */}
        <div className="px-6 py-3 bg-muted/40 border-b">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">SKU actual</p>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded border overflow-hidden bg-muted flex-shrink-0">
              {slot.sku.imagen_url && (
                <Image src={slot.sku.imagen_url} alt="" width={48} height={48}
                  className="object-cover w-12 h-12" unoptimized />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{slot.sku.nombre}</p>
              <p className="text-xs text-muted-foreground">{slot.sku.marca_nombre}</p>
            </div>
            <div className="flex gap-4 text-xs shrink-0">
              <div className="text-center">
                <p className="text-muted-foreground">GMROI</p>
                <p className="font-bold tabular-nums">{currentKpis?.avg_gmroi?.toFixed(2) ?? "—"}×</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Sellthru</p>
                <p className="font-bold tabular-nums">{currentKpis?.avg_sellthru?.toFixed(1) ?? "—"}%</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Margen</p>
                <p className="font-bold tabular-nums">{currentKpis?.avg_margen_pct?.toFixed(1) ?? "—"}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-6 py-2 border-b">
          <Tabs value={modo} onValueChange={v => { setModo(v as any); setSelected(null) }}>
            <TabsList className="h-8">
              <TabsTrigger value="categoria" className="text-xs">Misma categoría</TabsTrigger>
              <TabsTrigger value="marca"     className="text-xs">Misma marca</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Candidates list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse mb-2" />
              ))
            : candidates.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No hay candidatos en este modo</p>
              : candidates.map(c => (
                <button
                  key={c.id}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 mb-2 text-left transition-all",
                    selected?.id === c.id
                      ? "border-[var(--brand-magenta)] bg-[oklch(0.97_0.01_358)]"
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => setSelected(c)}
                >
                  {/* Image */}
                  <div className="h-12 w-12 rounded border overflow-hidden bg-muted flex-shrink-0">
                    {c.imagen_url && (
                      <Image src={c.imagen_url} alt="" width={48} height={48}
                        className="object-cover w-12 h-12" unoptimized />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate leading-tight">{c.nombre}</p>
                    <p className="text-xs text-muted-foreground">{c.marca_nombre}</p>
                  </div>

                  {/* KPIs + deltas */}
                  <div className="flex gap-3 text-xs shrink-0">
                    <div className="text-center min-w-12">
                      <p className="text-muted-foreground">GMROI</p>
                      <p className="font-bold tabular-nums">{c.avg_gmroi?.toFixed(2) ?? "—"}×</p>
                      <DeltaBadge delta={c.delta_gmroi} unit="×" />
                    </div>
                    <div className="text-center min-w-12">
                      <p className="text-muted-foreground">Sellthru</p>
                      <p className="font-bold tabular-nums">{c.avg_sellthru?.toFixed(1) ?? "—"}%</p>
                      <DeltaBadge delta={c.delta_sellthru} unit="%" />
                    </div>
                    <div className="text-center min-w-12">
                      <p className="text-muted-foreground">Margen</p>
                      <p className="font-bold tabular-nums">{c.avg_margen_pct?.toFixed(1) ?? "—"}%</p>
                      <DeltaBadge delta={c.delta_margen_pct} unit="%" />
                    </div>
                  </div>
                </button>
              ))
          }
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!selected}
            onClick={handleConfirm}
            style={{ background: "var(--brand-magenta)", color: "white" }}
          >
            Confirmar reemplazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
