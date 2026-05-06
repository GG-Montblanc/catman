"use client"

import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

type Props = {
  title: string
  value: string | number | null
  unit?: string
  trend?: number | null   // delta % vs período anterior (positivo = mejora)
  trendInvert?: boolean   // si true, delta negativo = verde (ej: días stock)
  color?: "green" | "yellow" | "red" | "gray"
  description?: string
  loading?: boolean
}

const COLOR_CLASSES = {
  green:  "border-l-4 border-emerald-500",
  yellow: "border-l-4 border-amber-400",
  red:    "border-l-4 border-rose-500",
  gray:   "border-l-4 border-border",
}

const VALUE_COLORS = {
  green:  "text-emerald-600 dark:text-emerald-400",
  yellow: "text-amber-600  dark:text-amber-400",
  red:    "text-rose-600   dark:text-rose-400",
  gray:   "text-foreground",
}

export function KpiCard({ title, value, unit, trend, trendInvert, color = "gray", description, loading }: Props) {
  const borderClass = COLOR_CLASSES[color]
  const valueClass  = VALUE_COLORS[color]

  const trendUp = trend != null ? (trendInvert ? trend < 0 : trend > 0) : null
  const trendIcon =
    trend == null   ? null
    : trendUp       ? <TrendingUp  className="h-3.5 w-3.5" />
                    : <TrendingDown className="h-3.5 w-3.5" />
  const trendColor =
    trend == null   ? ""
    : trendUp       ? "text-emerald-600"
                    : "text-rose-600"

  if (loading) {
    return (
      <div className={cn("rounded-xl border bg-card p-5 shadow-sm", COLOR_CLASSES.gray)}>
        <div className="h-4 w-24 rounded bg-muted animate-pulse mb-3" />
        <div className="h-8 w-16 rounded bg-muted animate-pulse" />
      </div>
    )
  }

  const formatted =
    value == null ? "—"
    : typeof value === "number" ? value.toLocaleString("es-CL", { maximumFractionDigits: 2 })
    : value

  return (
    <div className={cn("rounded-xl border bg-card p-5 shadow-sm", borderClass)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {title}
      </p>
      <div className="flex items-end gap-1.5">
        <span className={cn("text-3xl font-bold leading-none tabular-nums", valueClass)}>
          {formatted}
        </span>
        {unit && (
          <span className="text-sm text-muted-foreground mb-0.5">{unit}</span>
        )}
      </div>
      {(description || trend != null) && (
        <div className="mt-2 flex items-center gap-1.5">
          {trend != null && (
            <span className={cn("flex items-center gap-0.5 text-xs font-medium", trendColor)}>
              {trendIcon}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
      )}
    </div>
  )
}
