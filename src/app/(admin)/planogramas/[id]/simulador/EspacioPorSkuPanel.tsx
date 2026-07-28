"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Minus, LayoutGrid } from "lucide-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { calcularEspacioPorSku } from "@/lib/planogram/espacio-slots"
import type { PlanogramSlot } from "@/lib/planogram/types"

// Umbral en "frentes" para considerar que la diferencia es relevante —
// evita marcar como desbalance ruido de +/- 0.3 frentes.
const UMBRAL_DELTA = 0.75

export function EspacioPorSkuPanel({ slots }: { slots: PlanogramSlot[] }) {
  const [expanded, setExpanded] = useState(false)

  const items = useMemo(() => calcularEspacioPorSku(slots), [slots])

  const sobreEspaciados = items.filter(i => i.delta >= UMBRAL_DELTA)
  const subEspaciados = items.filter(i => i.delta <= -UMBRAL_DELTA)
  const visibles = expanded ? items : items.slice(0, 5).concat(items.slice(-5)).filter((v, i, arr) => arr.indexOf(v) === i)

  if (items.length === 0) return null

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Rentabilidad por espacio (SKU)</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {sobreEspaciados.length} con espacio de sobra · {subEspaciados.length} con poco espacio
        </span>
      </div>
      <p className="text-xs text-muted-foreground -mt-1.5">
        Frentes óptimos = espacio total del planograma ponderado 70% por ingreso y 30% por GMROI relativo.
      </p>

      <div className="space-y-1.5">
        {visibles.map(item => {
          const sobre = item.delta >= UMBRAL_DELTA
          const sub = item.delta <= -UMBRAL_DELTA
          const Icon = sobre ? ArrowDown : sub ? ArrowUp : Minus
          return (
            <div key={item.sku_id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <div className="h-8 w-8 shrink-0 rounded overflow-hidden bg-muted">
                {item.imagen_url ? (
                  <Image src={item.imagen_url} alt={item.nombre} width={32} height={32} className="object-cover h-8 w-8" unoptimized />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-tight truncate">{item.nombre}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {item.frentes_actual} frentes actuales · {item.pct_ingreso}% del ingreso · GMROI {item.avg_gmroi?.toFixed(2) ?? "—"}×
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 gap-1 text-[11px] tabular-nums",
                  sobre && "border-amber-300 bg-amber-50 text-amber-700",
                  sub && "border-sky-300 bg-sky-50 text-sky-700"
                )}
              >
                <Icon className="h-3 w-3" />
                {sobre ? "usa más espacio del que amerita" : sub ? "usa menos espacio del que amerita" : "equilibrado"}
                <span className="opacity-70">(óptimo ~{item.frentes_optimo})</span>
              </Badge>
            </div>
          )
        })}
      </div>

      {items.length > visibles.length && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-[var(--brand-magenta,#d4177a)] hover:opacity-80"
        >
          Ver los {items.length} SKUs →
        </button>
      )}
    </div>
  )
}
