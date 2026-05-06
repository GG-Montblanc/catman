"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts"
import type { SkuKpiItem } from "@/lib/kpi/types"

type Props = {
  data: SkuKpiItem[]
  mode: "top" | "bottom"
}

function truncate(s: string, n = 22) {
  return s.length > n ? s.slice(0, n) + "…" : s
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as SkuKpiItem
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm max-w-56">
      <p className="font-semibold mb-1 leading-tight">{d.nombre}</p>
      {d.marca_nombre && (
        <p className="text-xs text-muted-foreground mb-1.5">{d.marca_nombre}</p>
      )}
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">GMROI</span>
          <span className="font-semibold tabular-nums">{d.avg_gmroi?.toFixed(2) ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Sellthru</span>
          <span className="font-semibold tabular-nums">{d.avg_sellthru?.toFixed(1) ?? "—"}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Margen</span>
          <span className="font-semibold tabular-nums">{d.avg_margen_pct?.toFixed(1) ?? "—"}%</span>
        </div>
      </div>
    </div>
  )
}

const TOP_COLOR    = "oklch(0.62 0.20 358)"   // magenta
const BOTTOM_COLOR = "oklch(0.55 0.18 27)"    // coral/red

export function TopBottomBars({ data, mode }: Props) {
  if (!data.length) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
        Sin datos
      </div>
    )
  }

  const sorted = [...data].sort((a, b) =>
    mode === "top"
      ? (b.avg_gmroi ?? 0) - (a.avg_gmroi ?? 0)
      : (a.avg_gmroi ?? 0) - (b.avg_gmroi ?? 0)
  )

  const color = mode === "top" ? TOP_COLOR : BOTTOM_COLOR

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          domain={[0, "auto"]}
        />
        <YAxis
          type="category"
          dataKey="nombre"
          tickFormatter={(v) => truncate(v)}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent) / 0.15)" }} />
        <Bar dataKey="avg_gmroi" name="GMROI" radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={color} fillOpacity={1 - i * 0.05} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
