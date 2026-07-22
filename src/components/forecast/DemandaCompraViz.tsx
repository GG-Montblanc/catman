"use client"

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts"
import { TrendingUp, TrendingDown, Minus, ShoppingCart, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PurchaseRecommendation } from "@/lib/forecast/purchase-curve"

export type DemandaCompraPoint = {
  mes: string
  unidades: number | null
  forecast_u: number | null
  stock_proyectado: number | null
}

export type DemandaCompraData = {
  points: DemandaCompraPoint[]
  mape: number
  tendencia: "creciente" | "estable" | "decreciente"
  forecastStartIdx: number
  stockActual: number
  recomendacion: PurchaseRecommendation
  mesCompraLabel: string | null
}

const fmtCLP0 = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)

export function DemandaCompraViz({ data, title }: { data: DemandaCompraData; title?: string }) {
  const TrendIcon = data.tendencia === "creciente"
    ? TrendingUp
    : data.tendencia === "decreciente"
      ? TrendingDown
      : Minus

  const trendColor = data.tendencia === "creciente"
    ? "text-emerald-600"
    : data.tendencia === "decreciente"
      ? "text-rose-500"
      : "text-amber-500"

  const firstForecastMes = data.points[data.forecastStartIdx]?.mes
  const rec = data.recomendacion

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title ?? "Demanda y curva de compra (6 meses)"}</h4>
        <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span className="capitalize">{data.tendencia}</span>
          {data.mape > 0 && (
            <span className="text-muted-foreground font-normal ml-1">MAPE {data.mape.toFixed(0)}%</span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data.points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis yAxisId="demanda" tick={{ fontSize: 10 }} width={44} />
          <YAxis yAxisId="stock" orientation="right" tick={{ fontSize: 10 }} width={44} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(val, name) => [
              typeof val === "number" ? val.toLocaleString("es-CL") : "—",
              name === "unidades" ? "Real (u)" :
              name === "forecast_u" ? "Pronóstico (u)" :
              name === "stock_proyectado" ? "Stock proyectado (u)" : name,
            ]}
          />
          {firstForecastMes && (
            <ReferenceLine
              yAxisId="demanda"
              x={firstForecastMes}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{ value: "hoy", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            />
          )}
          <ReferenceLine
            yAxisId="stock"
            y={rec.puntoReorden}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            label={{ value: "punto de reorden", fontSize: 9, fill: "#f59e0b", position: "insideTopRight" }}
          />
          <Line
            yAxisId="demanda"
            type="monotone"
            dataKey="unidades"
            stroke="#d4177a"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            name="unidades"
          />
          <Line
            yAxisId="demanda"
            type="monotone"
            dataKey="forecast_u"
            stroke="#d4177a"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={true}
            name="forecast_u"
          />
          <Line
            yAxisId="stock"
            type="monotone"
            dataKey="stock_proyectado"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
            connectNulls={true}
            name="stock_proyectado"
          />
          <Legend
            iconType="line"
            iconSize={12}
            formatter={(v) =>
              v === "unidades" ? "Demanda real" :
              v === "forecast_u" ? "Demanda pronosticada" :
              v === "stock_proyectado" ? "Stock proyectado" : v
            }
          />
        </LineChart>
      </ResponsiveContainer>

      <div className={cn(
        "rounded-lg border p-3 flex items-start gap-2.5",
        rec.urgente ? "bg-rose-50 border-rose-200" : rec.mesCompraIdx !== null ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
      )}>
        {rec.urgente
          ? <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          : <ShoppingCart className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
        <div className="text-xs leading-snug">
          {rec.mesCompraIdx === null ? (
            <p className="font-medium text-emerald-800">
              Stock suficiente para los próximos 6 meses. No se requiere comprar todavía.
            </p>
          ) : (
            <>
              <p className={cn("font-semibold", rec.urgente ? "text-rose-800" : "text-amber-800")}>
                {rec.urgente
                  ? "Comprar ahora"
                  : `Comprar en ${data.mesCompraLabel}`}: {rec.unidadesSugeridas.toLocaleString("es-CL")} unidades (~{fmtCLP0(rec.valorEstimado)})
              </p>
              <p className="text-muted-foreground mt-0.5">
                Stock actual {Math.round(data.stockActual).toLocaleString("es-CL")} u. · punto de reorden {rec.puntoReorden.toFixed(0)} u. · objetivo {rec.inventarioObjetivo.toFixed(0)} u.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
