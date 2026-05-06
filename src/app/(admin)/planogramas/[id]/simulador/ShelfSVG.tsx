"use client"

import { useMemo } from "react"
import Image from "next/image"
import type { PlanogramSlot, PendingSwap, SlotKpis } from "@/lib/planogram/types"
import { slotColor, layerValue, type HeatmapLayer } from "@/lib/heatmap/colorScale"

const CELL_W  = 78
const CELL_H  = 96
const LABEL_W = 56
const HEADER  = 20
const PAD     = 4

type Props = {
  slots:        PlanogramSlot[]
  nBandejas:    number
  nPosiciones:  number
  layer:        HeatmapLayer
  pendingSwaps: Map<string, PendingSwap>   // key = slot_id
  onSlotClick:  (slot: PlanogramSlot, kpis: SlotKpis | null) => void
}

function fmt(v: number | null, unit: string) {
  if (v == null) return "—"
  return `${v.toFixed(1)}${unit}`
}

// GMROi overlay text for each cell
function cellLabel(layer: HeatmapLayer, kpis: SlotKpis | null): string {
  if (!kpis) return "—"
  switch (layer) {
    case "gmroi":    return fmt(kpis.avg_gmroi, "×")
    case "sellthru": return fmt(kpis.avg_sellthru, "%")
    case "mdi":      return fmt(kpis.avg_mdi, "m")
    case "ingreso": {
      const v = kpis.total_ingreso
      if (v == null) return "—"
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
      return `$${v.toFixed(0)}`
    }
  }
}

export function ShelfSVG({ slots, nBandejas, nPosiciones, layer, pendingSwaps, onSlotClick }: Props) {
  const slotMap = useMemo(() => {
    const m = new Map<string, PlanogramSlot>()
    for (const s of slots) m.set(`${s.bandeja}|${s.posicion}`, s)
    return m
  }, [slots])

  const maxIngreso = useMemo(() => {
    let m = 0
    for (const s of slots) m = Math.max(m, s.kpis?.total_ingreso ?? 0)
    return m
  }, [slots])

  const svgW = LABEL_W + nPosiciones * (CELL_W + PAD) + PAD
  const svgH = HEADER + nBandejas * (CELL_H + PAD) + PAD + 24 // +24 for bottom floor line

  // Eye-level bandejas (2 and 3 from top)
  const eyeLevelBandejas = new Set([2, 3])

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>
        {/* Column position labels */}
        {Array.from({ length: nPosiciones }, (_, i) => (
          <text
            key={i}
            x={LABEL_W + i * (CELL_W + PAD) + CELL_W / 2}
            y={14}
            fontSize={9}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
          >
            {i + 1}
          </text>
        ))}

        {/* Shelf rows */}
        {Array.from({ length: nBandejas }, (_, bi) => {
          const bandeja = bi + 1
          const rowY    = HEADER + bi * (CELL_H + PAD)
          const isEye   = eyeLevelBandejas.has(bandeja)

          return (
            <g key={bandeja}>
              {/* Row label */}
              <text
                x={LABEL_W - 8}
                y={rowY + CELL_H / 2 + 4}
                fontSize={10}
                textAnchor="end"
                fill={isEye ? "oklch(0.62 0.20 358)" : "hsl(var(--muted-foreground))"}
                fontWeight={isEye ? "700" : "400"}
              >
                B{bandeja}
              </text>

              {/* Eye-level indicator */}
              {isEye && (
                <rect
                  x={LABEL_W - 4}
                  y={rowY}
                  width={3}
                  height={CELL_H}
                  fill="oklch(0.62 0.20 358)"
                  rx={1.5}
                />
              )}

              {/* Shelf background line (simulates physical shelf) */}
              <line
                x1={LABEL_W}
                x2={LABEL_W + nPosiciones * (CELL_W + PAD)}
                y1={rowY + CELL_H + PAD - 3}
                y2={rowY + CELL_H + PAD - 3}
                stroke="oklch(0.65 0 0)"
                strokeWidth={2}
              />

              {/* Cells */}
              {Array.from({ length: nPosiciones }, (_, pi) => {
                const posicion = pi + 1
                const slot     = slotMap.get(`${bandeja}|${posicion}`)
                const x        = LABEL_W + pi * (CELL_W + PAD)
                const y        = rowY

                if (!slot) {
                  return (
                    <rect
                      key={posicion}
                      x={x + 1} y={y + 1}
                      width={CELL_W - 2} height={CELL_H - 2}
                      fill="oklch(0.96 0 0)"
                      rx={3}
                      stroke="hsl(var(--border))"
                      strokeWidth={0.5}
                    />
                  )
                }

                const pending  = pendingSwaps.get(slot.id)
                const dispSku  = pending?.new_sku ?? slot.sku
                const dispKpis = pending?.new_kpis ?? slot.kpis
                const hasPending = !!pending

                const val = layerValue(layer, dispKpis)
                const bg  = slotColor(layer, val, maxIngreso)
                const labelText = cellLabel(layer, dispKpis)

                return (
                  <g
                    key={posicion}
                    onClick={() => onSlotClick(slot, dispKpis)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Cell background */}
                    <rect
                      x={x + 1} y={y + 1}
                      width={CELL_W - 2} height={CELL_H - 2}
                      fill={bg}
                      rx={3}
                      stroke={hasPending ? "oklch(0.62 0.20 358)" : "oklch(0.85 0 0)"}
                      strokeWidth={hasPending ? 2 : 0.5}
                    />

                    {/* SKU image */}
                    {dispSku.imagen_url ? (
                      <image
                        href={dispSku.imagen_url}
                        x={x + 6} y={y + 6}
                        width={CELL_W - 12}
                        height={52}
                        preserveAspectRatio="xMidYMid meet"
                        style={{ borderRadius: 2 }}
                      />
                    ) : (
                      <rect
                        x={x + 6} y={y + 6}
                        width={CELL_W - 12} height={52}
                        fill="oklch(0.88 0 0)"
                        rx={2}
                      />
                    )}

                    {/* KPI label */}
                    <rect
                      x={x + 1} y={y + CELL_H - 22}
                      width={CELL_W - 2} height={21}
                      fill="oklch(0 0 0 / 0.45)"
                      rx="0 0 3 3"
                    />
                    <text
                      x={x + CELL_W / 2} y={y + CELL_H - 9}
                      fontSize={9}
                      textAnchor="middle"
                      fill="white"
                      fontWeight="700"
                    >
                      {labelText}
                    </text>

                    {/* Pending change badge */}
                    {hasPending && (
                      <>
                        <circle cx={x + CELL_W - 8} cy={y + 8} r={6} fill="oklch(0.62 0.20 358)" />
                        <text x={x + CELL_W - 8} y={y + 12} fontSize={8} textAnchor="middle" fill="white">↔</text>
                      </>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Floor line */}
        <line
          x1={LABEL_W} x2={LABEL_W + nPosiciones * (CELL_W + PAD)}
          y1={HEADER + nBandejas * (CELL_H + PAD) + 4}
          y2={HEADER + nBandejas * (CELL_H + PAD) + 4}
          stroke="oklch(0.45 0 0)"
          strokeWidth={3}
        />
      </svg>
    </div>
  )
}
