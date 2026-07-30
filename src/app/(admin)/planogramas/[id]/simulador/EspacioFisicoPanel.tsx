"use client"

import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, Ruler } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PlanogramData } from "@/lib/planogram/types"

const ANCHO_POR_POSICION_FALLBACK = 6 // cm, usado cuando el planograma no tiene ancho_cm fisico definido

type BandejaCapacidad = {
  bandeja: number
  ocupado_cm: number
  disponible_cm: number
  pct: number
  sobrecargado: boolean
}

export function EspacioFisicoPanel({ planograma }: { planograma: PlanogramData }) {
  const disponible_cm = planograma.ancho_cm ?? planograma.n_posiciones * ANCHO_POR_POSICION_FALLBACK
  const esFallback = planograma.ancho_cm == null

  const bandejas: BandejaCapacidad[] = useMemo(() => {
    const porBandeja = new Map<number, number>()
    for (const slot of planograma.slots ?? []) {
      const ancho = slot.sku.ancho_cm ?? 5
      const ocupado = ancho * Math.max(1, slot.frente ?? 1)
      porBandeja.set(slot.bandeja, (porBandeja.get(slot.bandeja) ?? 0) + ocupado)
    }
    return Array.from({ length: planograma.n_bandejas }, (_, i) => i + 1).map(b => {
      const ocupado_cm = porBandeja.get(b) ?? 0
      const pct = disponible_cm > 0 ? (ocupado_cm / disponible_cm) * 100 : 0
      return {
        bandeja: b,
        ocupado_cm,
        disponible_cm,
        pct,
        sobrecargado: pct > 100,
      }
    })
  }, [planograma, disponible_cm])

  const hayProblemas = bandejas.some(b => b.sobrecargado)

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
          Espacio físico por bandeja
        </h3>
        {hayProblemas ? (
          <span className="flex items-center gap-1 text-xs font-medium text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            No cabe en {bandejas.filter(b => b.sobrecargado).length} bandeja{bandejas.filter(b => b.sobrecargado).length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Todo cabe
          </span>
        )}
      </div>

      {esFallback && (
        <p className="text-[11px] text-muted-foreground italic">
          Este planograma no tiene ancho físico definido — se estima {ANCHO_POR_POSICION_FALLBACK}cm por posición
          ({disponible_cm.toFixed(0)}cm totales). Edítalo en el wizard para un cálculo exacto.
        </p>
      )}

      <div className="space-y-2">
        {bandejas.map(b => (
          <div key={b.bandeja} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">Bandeja {b.bandeja}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  b.sobrecargado ? "bg-rose-500" : b.pct > 85 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(100, b.pct)}%` }}
              />
            </div>
            <span className={cn(
              "w-24 shrink-0 text-right text-[11px] tabular-nums",
              b.sobrecargado ? "text-rose-600 font-semibold" : "text-muted-foreground"
            )}>
              {b.ocupado_cm.toFixed(0)} / {b.disponible_cm.toFixed(0)}cm
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
