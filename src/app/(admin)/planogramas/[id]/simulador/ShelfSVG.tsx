"use client"

import { useMemo, useState, useRef, useCallback } from "react"
import Image from "next/image"
import type { PlanogramSlot, PendingSwap, SlotKpis } from "@/lib/planogram/types"
import { slotColor, layerValue, type HeatmapLayer } from "@/lib/heatmap/colorScale"
import { cn } from "@/lib/utils"

// ─── Layout constants ──────────────────────────────────────────────────────────
const CELL_W   = 88    // cell width
const CELL_H   = 116   // cell height (image 60 + name 20 + kpi 22 + padding 14)
const IMG_H    = 60    // product image height
const NAME_H   = 20    // product name bar
const KPI_H    = 22    // bottom KPI bar
const LABEL_W  = 52    // left axis labels
const HEADER_H = 22    // top column numbers
const GAP      = 3     // gap between cells
const PAD      = 6     // outer padding

// ─── Tooltip state ─────────────────────────────────────────────────────────────
type TooltipState = {
  slot:  PlanogramSlot
  kpis:  SlotKpis | null
  x:     number  // relative to container
  y:     number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtKpi(v: number | null, unit: string) {
  if (v == null) return "—"
  return `${v.toFixed(1)}${unit}`
}

function fmtIngreso(v: number | null) {
  if (v == null) return "—"
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function kpiLabel(layer: HeatmapLayer, kpis: SlotKpis | null): string {
  if (!kpis) return "—"
  switch (layer) {
    case "gmroi":    return fmtKpi(kpis.avg_gmroi,    "×")
    case "sellthru": return fmtKpi(kpis.avg_sellthru, "%")
    case "mdi":      return fmtKpi(kpis.avg_mdi,      "m")
    case "ingreso":  return fmtIngreso(kpis.total_ingreso)
  }
}

// Truncate text by character count
function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

// ─── Legend ────────────────────────────────────────────────────────────────────
const LEGEND_CONFIG: Record<HeatmapLayer, { steps: { label: string; color: string }[]; title: string }> = {
  gmroi: {
    title: "GMROI",
    steps: [
      { label: "< 0.5",  color: "oklch(0.70 0.13 25)"  },
      { label: "0.5–1.4",color: "oklch(0.74 0.135 50)" },
      { label: "1.4–2.0",color: "oklch(0.78 0.14 75)"  },
      { label: "2.0–2.6",color: "oklch(0.70 0.15 110)" },
      { label: "> 2.6",  color: "oklch(0.55 0.17 142)" },
    ],
  },
  sellthru: {
    title: "Sellthru",
    steps: [
      { label: "< 20%",  color: "oklch(0.70 0.13 25)"  },
      { label: "20–40%", color: "oklch(0.74 0.135 50)" },
      { label: "40–55%", color: "oklch(0.78 0.14 75)"  },
      { label: "55–70%", color: "oklch(0.70 0.15 110)" },
      { label: "> 70%",  color: "oklch(0.55 0.17 142)" },
    ],
  },
  mdi: {
    title: "MDI (meses inventario)",
    steps: [
      { label: "< 2m",   color: "oklch(0.48 0.18 142)" },
      { label: "2–3m",   color: "oklch(0.60 0.16 142)" },
      { label: "3–6m",   color: "oklch(0.78 0.14 75)"  },
      { label: "6–12m",  color: "oklch(0.70 0.13 25)"  },
      { label: "> 12m",  color: "oklch(0.58 0.20 20)"  },
    ],
  },
  ingreso: {
    title: "Ingreso ($)",
    steps: [
      { label: "Bajo",   color: "oklch(0.92 0 0)"      },
      { label: "Medio",  color: "oklch(0.78 0.08 198)" },
      { label: "Alto",   color: "oklch(0.65 0.12 198)" },
      { label: "Muy alto", color:"oklch(0.48 0.15 198)"},
    ],
  },
}

function HeatmapLegend({ layer }: { layer: HeatmapLayer }) {
  const cfg = LEGEND_CONFIG[layer]
  return (
    <div className="flex items-center gap-3 mt-3 px-1">
      <span className="text-xs text-muted-foreground font-medium shrink-0">{cfg.title}:</span>
      <div className="flex items-center gap-1 flex-wrap">
        {cfg.steps.map(step => (
          <div key={step.label} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm border border-white/20"
              style={{ background: step.color }}
            />
            <span className="text-xs text-muted-foreground">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tooltip overlay ───────────────────────────────────────────────────────────
function SlotTooltip({ tt, layer }: { tt: TooltipState; layer: HeatmapLayer }) {
  const { slot, kpis } = tt
  const disp = slot.sku

  // Clamp position so tooltip doesn't overflow right edge
  const LEFT_OFFSET = 14
  const TOP_OFFSET  = -10

  const gmroiColor = kpis?.avg_gmroi != null
    ? kpis.avg_gmroi >= 2.0 ? "#10b981"
    : kpis.avg_gmroi >= 1.0 ? "#f59e0b"
    : "#ef4444"
    : "#6b7280"

  return (
    <div
      className="pointer-events-none absolute z-50 w-60 rounded-xl border bg-popover shadow-xl text-sm"
      style={{ left: tt.x + LEFT_OFFSET, top: tt.y + TOP_OFFSET }}
    >
      {/* Header */}
      <div className="flex gap-2.5 p-3 border-b">
        <div className="h-12 w-12 flex-shrink-0 rounded-lg overflow-hidden border bg-muted">
          {disp.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={disp.imagen_url}
              alt={disp.nombre}
              className="h-12 w-12 object-contain"
            />
          ) : (
            <div className="h-12 w-12 bg-muted" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight text-xs line-clamp-2">{disp.nombre}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{disp.marca_nombre ?? "Sin marca"}</p>
          <p className="text-xs text-muted-foreground">B{slot.bandeja} · Pos {slot.posicion}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">GMROI</span>
          <span className="font-bold tabular-nums" style={{ color: gmroiColor }}>
            {kpis?.avg_gmroi?.toFixed(2) ?? "—"}×
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sellthru</span>
          <span className="font-semibold tabular-nums">{kpis?.avg_sellthru?.toFixed(1) ?? "—"}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Margen</span>
          <span className="font-semibold tabular-nums">{kpis?.avg_margen_pct?.toFixed(1) ?? "—"}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">MDI</span>
          <span className="font-semibold tabular-nums">{kpis?.avg_mdi?.toFixed(1) ?? "—"}m</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fill Rate</span>
          <span className="font-semibold tabular-nums">{kpis?.avg_fill_rate?.toFixed(1) ?? "—"}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Ingreso</span>
          <span className="font-semibold tabular-nums">{fmtIngreso(kpis?.total_ingreso ?? null)}</span>
        </div>
      </div>

      {/* Precio */}
      <div className="px-3 pb-3 pt-0">
        <div className="flex justify-between text-xs border-t pt-2">
          <span className="text-muted-foreground">Precio lista</span>
          <span className="font-semibold tabular-nums">
            {disp.precio_lista
              ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(disp.precio_lista)
              : "—"}
          </span>
        </div>
      </div>

      {/* Hint */}
      <div className="px-3 pb-2.5">
        <p className="text-[10px] text-muted-foreground text-center">
          Click para reemplazar SKU
        </p>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
type Props = {
  slots:        PlanogramSlot[]
  nBandejas:    number
  nPosiciones:  number
  layer:        HeatmapLayer
  pendingSwaps: Map<string, PendingSwap>
  onSlotClick:  (slot: PlanogramSlot, kpis: SlotKpis | null) => void
}

export function ShelfSVG({ slots, nBandejas, nPosiciones, layer, pendingSwaps, onSlotClick }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const [hovered, setHovered]   = useState<TooltipState | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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

  const svgW = LABEL_W + PAD + nPosiciones * (CELL_W + GAP) - GAP + PAD
  const svgH = HEADER_H + PAD + nBandejas * (CELL_H + GAP) - GAP + PAD + 10

  const eyeLevelSet = new Set([2, 3])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setHovered(prev => prev ? { ...prev, x, y } : null)
  }, [])

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">🏪</div>
        <p className="font-semibold text-sm">Planograma vacío</p>
        <p className="text-xs text-muted-foreground mt-1">
          Genera slots desde el editor para ver el mapa de calor
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="overflow-x-auto rounded-xl border bg-card shadow-sm relative" style={{ position: "relative" }}>
        <svg
          width={svgW}
          height={svgH}
          style={{ display: "block", minWidth: svgW }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setHovered(null); setHoveredId(null) }}
        >
          {/* ── Column position labels ── */}
          {Array.from({ length: nPosiciones }, (_, i) => (
            <text
              key={i}
              x={LABEL_W + PAD + i * (CELL_W + GAP) + CELL_W / 2}
              y={15}
              fontSize={9}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
            >
              {i + 1}
            </text>
          ))}

          {/* ── Shelf rows ── */}
          {Array.from({ length: nBandejas }, (_, bi) => {
            const bandeja = bi + 1
            const rowY    = HEADER_H + PAD + bi * (CELL_H + GAP)
            const isEye   = eyeLevelSet.has(bandeja)

            return (
              <g key={bandeja}>
                {/* Row label */}
                <text
                  x={LABEL_W - 6}
                  y={rowY + CELL_H / 2 + 4}
                  fontSize={11}
                  textAnchor="end"
                  fill={isEye ? "oklch(0.62 0.20 358)" : "hsl(var(--muted-foreground))"}
                  fontWeight={isEye ? "700" : "400"}
                >
                  B{bandeja}
                </text>

                {/* Eye-level accent bar */}
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

                {/* Physical shelf line */}
                <line
                  x1={LABEL_W}
                  x2={svgW - PAD}
                  y1={rowY + CELL_H + 1}
                  y2={rowY + CELL_H + 1}
                  stroke={isEye ? "oklch(0.62 0.20 358 / 0.3)" : "oklch(0.72 0 0 / 0.4)"}
                  strokeWidth={isEye ? 2.5 : 1.5}
                />

                {/* Cells */}
                {Array.from({ length: nPosiciones }, (_, pi) => {
                  const posicion = pi + 1
                  const slot     = slotMap.get(`${bandeja}|${posicion}`)
                  const x        = LABEL_W + PAD + pi * (CELL_W + GAP)
                  const y        = rowY

                  // Empty slot
                  if (!slot) {
                    return (
                      <rect
                        key={posicion}
                        x={x} y={y}
                        width={CELL_W} height={CELL_H}
                        fill="oklch(0.95 0 0)"
                        rx={5}
                        stroke="oklch(0.88 0 0)"
                        strokeWidth={0.5}
                        strokeDasharray="3 3"
                      />
                    )
                  }

                  const pending   = pendingSwaps.get(slot.id)
                  const dispSku   = pending?.new_sku  ?? slot.sku
                  const dispKpis  = pending?.new_kpis ?? slot.kpis
                  const isPending = !!pending
                  const isHovered = hoveredId === slot.id

                  const val = layerValue(layer, dispKpis)
                  const bg  = slotColor(layer, val, maxIngreso)
                  const kpiText = kpiLabel(layer, dispKpis)
                  const nameText = truncate(dispSku.nombre, 14)

                  return (
                    <g
                      key={posicion}
                      onClick={() => {
                        onSlotClick(slot, dispKpis)
                        setHovered(null)
                        setHoveredId(null)
                      }}
                      onMouseEnter={(e) => {
                        if (!containerRef.current) return
                        const rect = containerRef.current.getBoundingClientRect()
                        setHovered({
                          slot: { ...slot, sku: dispSku, kpis: dispKpis },
                          kpis: dispKpis,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        })
                        setHoveredId(slot.id)
                      }}
                      onMouseLeave={() => {
                        setHovered(null)
                        setHoveredId(null)
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Cell background (heatmap color) */}
                      <rect
                        x={x} y={y}
                        width={CELL_W} height={CELL_H}
                        fill={bg}
                        rx={5}
                        stroke={
                          isPending ? "oklch(0.62 0.20 358)"
                          : isHovered ? "oklch(0.50 0.05 240)"
                          : "oklch(0.80 0 0 / 0.5)"
                        }
                        strokeWidth={isPending ? 2.5 : isHovered ? 1.5 : 0.5}
                        style={{
                          filter: isHovered ? "brightness(1.04)" : undefined,
                          transition: "all 0.1s",
                        }}
                      />

                      {/* Hover overlay */}
                      {isHovered && (
                        <rect
                          x={x} y={y}
                          width={CELL_W} height={CELL_H}
                          fill="oklch(0 0 0 / 0.06)"
                          rx={5}
                          pointerEvents="none"
                        />
                      )}

                      {/* Product image */}
                      {dispSku.imagen_url ? (
                        <image
                          href={dispSku.imagen_url}
                          x={x + 4} y={y + 4}
                          width={CELL_W - 8}
                          height={IMG_H}
                          preserveAspectRatio="xMidYMid meet"
                          style={{ borderRadius: 3 }}
                          clipPath={`url(#img-clip-${slot.id})`}
                        />
                      ) : (
                        <rect
                          x={x + 4} y={y + 4}
                          width={CELL_W - 8} height={IMG_H}
                          fill="oklch(0.88 0 0)"
                          rx={3}
                        />
                      )}

                      {/* Subtle image border */}
                      <rect
                        x={x + 4} y={y + 4}
                        width={CELL_W - 8} height={IMG_H}
                        fill="none"
                        stroke="oklch(0 0 0 / 0.08)"
                        strokeWidth={0.5}
                        rx={3}
                        pointerEvents="none"
                      />

                      {/* Product name row */}
                      <rect
                        x={x} y={y + IMG_H + 6}
                        width={CELL_W} height={NAME_H}
                        fill="oklch(0 0 0 / 0.04)"
                        pointerEvents="none"
                      />
                      <text
                        x={x + CELL_W / 2}
                        y={y + IMG_H + 6 + NAME_H / 2 + 4}
                        fontSize={8.5}
                        textAnchor="middle"
                        fill="hsl(var(--foreground))"
                        fontWeight="500"
                      >
                        {nameText}
                      </text>

                      {/* KPI bar */}
                      <rect
                        x={x} y={y + CELL_H - KPI_H}
                        width={CELL_W} height={KPI_H}
                        fill="oklch(0 0 0 / 0.50)"
                        rx="0 0 5 5"
                        pointerEvents="none"
                      />
                      <text
                        x={x + CELL_W / 2}
                        y={y + CELL_H - KPI_H / 2 + 4}
                        fontSize={9.5}
                        textAnchor="middle"
                        fill="white"
                        fontWeight="700"
                      >
                        {kpiText}
                      </text>

                      {/* Pending swap ribbon */}
                      {isPending && (
                        <>
                          <polygon
                            points={`${x + CELL_W - 22},${y} ${x + CELL_W},${y} ${x + CELL_W},${y + 22}`}
                            fill="oklch(0.62 0.20 358)"
                          />
                          <text
                            x={x + CELL_W - 5}
                            y={y + 13}
                            fontSize={8}
                            textAnchor="middle"
                            fill="white"
                            fontWeight="700"
                            transform={`rotate(45, ${x + CELL_W - 8}, ${y + 10})`}
                          >
                            ↔
                          </text>
                        </>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* Floor */}
          <line
            x1={LABEL_W}
            x2={svgW - PAD}
            y1={svgH - 6}
            y2={svgH - 6}
            stroke="oklch(0.40 0 0)"
            strokeWidth={3}
            strokeLinecap="round"
          />

          {/* Eye-level badge */}
          <rect x={LABEL_W} y={HEADER_H + PAD + (CELL_H + GAP)} width={84} height={16} rx={3} fill="oklch(0.62 0.20 358 / 0.12)" />
          <text
            x={LABEL_W + 42}
            y={HEADER_H + PAD + (CELL_H + GAP) + 11}
            fontSize={8}
            textAnchor="middle"
            fill="oklch(0.62 0.20 358)"
            fontWeight="600"
          >
            ★ EYE LEVEL
          </text>
        </svg>

        {/* Tooltip overlay */}
        {hovered && <SlotTooltip tt={hovered} layer={layer} />}
      </div>

      {/* Color legend */}
      <HeatmapLegend layer={layer} />
    </div>
  )
}
