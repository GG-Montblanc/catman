"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { TendenciaMensual } from "@/lib/kpi/types"

type MetricKey = "avg_gmroi" | "avg_sellthru" | "avg_margen_pct" | "avg_fill_rate"

const METRICS: { key: MetricKey; label: string; color: string; unit: string }[] = [
  { key: "avg_gmroi",      label: "GMROI",      color: "oklch(0.62 0.20 358)", unit: "x" },
  { key: "avg_sellthru",   label: "Sellthru %", color: "oklch(0.65 0.09 198)", unit: "%" },
  { key: "avg_margen_pct", label: "Margen %",   color: "oklch(0.72 0.14 142)", unit: "%" },
  { key: "avg_fill_rate",  label: "Fill Rate %", color: "oklch(0.68 0.10 60)",  unit: "%" },
]

type Props = {
  data: TendenciaMensual[]
  activeMetrics?: MetricKey[]
}

function fmt(d: string) {
  try { return format(new Date(d), "MMM yy", { locale: es }) }
  catch { return d }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <p className="font-medium mb-1.5">{fmt(label)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums">{p.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

export function KpiTrendLine({ data, activeMetrics }: Props) {
  const active = activeMetrics ?? ["avg_gmroi", "avg_sellthru"]
  const metrics = METRICS.filter(m => active.includes(m.key))

  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Sin datos para el período seleccionado
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="anio_mes"
          tickFormatter={fmt}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
          iconSize={8}
        />
        {metrics.map(m => (
          <Line
            key={m.key}
            type="monotone"
            dataKey={m.key}
            name={m.label}
            stroke={m.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
