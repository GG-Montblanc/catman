"use client"

import { useMemo, useState } from "react"
import type { HeatmapCell } from "@/lib/kpi/types"

type Props = {
  data: HeatmapCell[]
  gmroiTarget?: number
}

// oklch color scale: gray → yellow → green (higher = greener)
function gmroiToColor(v: number | null, max: number): string {
  if (v == null || max === 0) return "oklch(0.92 0 0)"
  const norm = Math.min(v / max, 1)
  if (norm >= 0.7) return `oklch(${0.55 + norm * 0.1} ${0.15 + norm * 0.05} 142)`  // green
  if (norm >= 0.4) return `oklch(${0.70 + norm * 0.05} 0.15 75)`                    // yellow
  return `oklch(${0.75 + norm * 0.1} 0.12 27)`                                       // red-ish
}

function gmroiLabel(v: number | null) {
  if (v == null) return "—"
  return v.toFixed(1)
}

export function CategoriaTiendaHeatmap({ data, gmroiTarget = 2 }: Props) {
  const [hovered, setHovered] = useState<HeatmapCell | null>(null)

  const { cats, tiendas, matrix, maxGmroi } = useMemo(() => {
    if (!data.length) return { cats: [], tiendas: [], matrix: new Map(), maxGmroi: 0 }

    const catMap  = new Map<string, string>()
    const tiendaMap = new Map<string, string>()
    for (const c of data) {
      catMap.set(c.cat_id, c.cat_nombre)
      tiendaMap.set(c.tienda_id, c.tienda_nombre)
    }

    // Ordenar tiendas por total ingreso para mostrar las más importantes primero
    const tiendaIngreso = new Map<string, number>()
    for (const c of data) {
      tiendaIngreso.set(c.tienda_id, (tiendaIngreso.get(c.tienda_id) ?? 0) + (c.total_ingreso ?? 0))
    }
    const cats   = [...catMap.entries()].map(([id, nombre]) => ({ id, nombre }))
    const tiendas = [...tiendaMap.entries()]
      .map(([id, nombre]) => ({ id, nombre, ingreso: tiendaIngreso.get(id) ?? 0 }))
      .sort((a, b) => b.ingreso - a.ingreso)
      .slice(0, 20)   // max 20 tiendas para legibilidad

    const matrix = new Map<string, HeatmapCell>()
    for (const c of data) matrix.set(`${c.cat_id}|${c.tienda_id}`, c)

    const maxGmroi = Math.max(...data.map(c => c.avg_gmroi ?? 0))

    return { cats, tiendas, matrix, maxGmroi }
  }, [data])

  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Sin datos para el período seleccionado
      </div>
    )
  }

  const CELL_W = 42
  const CELL_H = 32
  const LABEL_W = 100
  const HEADER_H = 72

  const svgW = LABEL_W + tiendas.length * CELL_W + 16
  const svgH = HEADER_H + cats.length * CELL_H + 8

  return (
    <div className="relative overflow-x-auto">
      {hovered && (
        <div className="absolute top-2 right-2 z-10 rounded-lg border bg-popover p-3 shadow-md text-xs max-w-48">
          <p className="font-semibold mb-0.5">{hovered.cat_nombre}</p>
          <p className="text-muted-foreground mb-1.5">{hovered.tienda_nombre}</p>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">GMROI</span>
            <span className="font-bold">{gmroiLabel(hovered.avg_gmroi)}</span>
          </div>
          {hovered.total_ingreso != null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Ingreso</span>
              <span className="font-semibold tabular-nums">
                ${(hovered.total_ingreso / 1_000_000).toFixed(1)}M
              </span>
            </div>
          )}
        </div>
      )}
      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        {/* Tienda headers (rotados 45°) */}
        {tiendas.map((t, i) => (
          <text
            key={t.id}
            x={LABEL_W + i * CELL_W + CELL_W / 2}
            y={HEADER_H - 4}
            fontSize={9}
            fill="hsl(var(--muted-foreground))"
            textAnchor="start"
            transform={`rotate(-45, ${LABEL_W + i * CELL_W + CELL_W / 2}, ${HEADER_H - 4})`}
          >
            {t.nombre.length > 18 ? t.nombre.slice(0, 18) + "…" : t.nombre}
          </text>
        ))}

        {/* Rows */}
        {cats.map((cat, ci) => (
          <g key={cat.id}>
            {/* Category label */}
            <text
              x={LABEL_W - 6}
              y={HEADER_H + ci * CELL_H + CELL_H / 2 + 4}
              fontSize={11}
              fill="hsl(var(--foreground))"
              textAnchor="end"
              fontWeight="500"
            >
              {cat.nombre.length > 14 ? cat.nombre.slice(0, 14) + "…" : cat.nombre}
            </text>

            {/* Cells */}
            {tiendas.map((tienda, ti) => {
              const cell = matrix.get(`${cat.id}|${tienda.id}`)
              const bg   = gmroiToColor(cell?.avg_gmroi ?? null, maxGmroi)
              const x    = LABEL_W + ti * CELL_W
              const y    = HEADER_H + ci * CELL_H
              return (
                <g key={tienda.id}
                  onMouseEnter={() => setHovered(cell ?? null)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                >
                  <rect x={x + 1} y={y + 1} width={CELL_W - 2} height={CELL_H - 2}
                    fill={bg} rx={2} />
                  <text
                    x={x + CELL_W / 2} y={y + CELL_H / 2 + 4}
                    fontSize={8} textAnchor="middle"
                    fill={cell?.avg_gmroi != null ? "oklch(0.15 0 0)" : "hsl(var(--muted-foreground))"}
                  >
                    {gmroiLabel(cell?.avg_gmroi ?? null)}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm inline-block" style={{ background: "oklch(0.65 0.17 27)" }} />
          Bajo (&lt; 1.4×)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm inline-block" style={{ background: "oklch(0.73 0.15 75)" }} />
          Medio (1.4–2.6×)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm inline-block" style={{ background: "oklch(0.58 0.18 142)" }} />
          Alto (&gt; 2.6×)
        </div>
      </div>
    </div>
  )
}
