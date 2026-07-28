"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
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
import { Badge } from "@/components/ui/badge"
import {
  fetchMargenAporteResumen,
  fetchMargenAportePorMarca,
  fetchMargenAporteTendencia,
} from "@/lib/kpi/queries"
import type { DashboardFilters } from "@/lib/kpi/types"

function fmtCLP(v: number | null | undefined) {
  if (v == null) return "—"
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function fmtMes(d: string) {
  try { return format(new Date(d), "MMM yy", { locale: es }) }
  catch { return d }
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <p className="font-medium mb-1.5">{fmtMes(label)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums">{p.value?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

type Props = {
  filters: DashboardFilters
}

export function MargenAportePanel({ filters }: Props) {
  const [soloTerceros, setSoloTerceros] = useState(true)
  const filtersKey = JSON.stringify(filters)

  const { data: resumen, isLoading: loadingResumen } = useQuery({
    queryKey: ["margen_aporte_resumen", filtersKey],
    queryFn: () => fetchMargenAporteResumen(filters),
    staleTime: 5 * 60 * 1000,
  })

  const { data: tendencia = [], isLoading: loadingTendencia } = useQuery({
    queryKey: ["margen_aporte_tendencia", filters.tienda, filters.marca],
    queryFn: () => fetchMargenAporteTendencia(
      format(new Date(new Date().setMonth(new Date().getMonth() - 24)), "yyyy-MM-dd"),
      filters.hasta,
      filters.tienda,
      filters.marca,
    ),
    staleTime: 5 * 60 * 1000,
  })

  const { data: porMarca = [], isLoading: loadingPorMarca } = useQuery({
    queryKey: ["margen_aporte_por_marca", filters.desde, filters.hasta, filters.tienda, filters.canal, filters.region],
    queryFn: () => fetchMargenAportePorMarca(filters.desde, filters.hasta, filters.tienda, filters.canal, filters.region),
    staleTime: 5 * 60 * 1000,
  })

  const marcasVisibles = soloTerceros ? porMarca.filter(m => !m.propia) : porMarca

  return (
    <div className="space-y-4">
      {/* Disclaimer de metodología */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 px-4 py-3 flex items-start gap-2.5">
        <span className="text-base shrink-0">ℹ️</span>
        <p className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
          <strong>Margen con aporte de proveedores (estimado):</strong> no existe en el sistema un registro real
          de fondeo comercial de proveedores (rebates, fondos de marketing, descuentos pie de factura). Se estima
          de forma determinística — solo para marcas de terceros — comparando el margen bruto de cada marca
          contra el resto del portafolio: la marca con el margen más bajo del período recibe 8% de aporte
          estimado, la de margen más alto recibe 2%, y el resto se interpola linealmente. No es una cifra
          contractual real.
        </p>
      </div>

      {/* Big comparison cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Margen bruto</p>
          <p className="text-2xl font-bold tabular-nums leading-none">
            {loadingResumen ? "…" : `${resumen?.margen_pct_bruto?.toFixed(1) ?? "—"}%`}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">{fmtCLP(resumen?.total_margen_bruto)}</p>
        </div>
        <div className="rounded-xl border bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
          <p className="text-xs text-muted-foreground mb-1">Margen con aporte proveedores</p>
          <p className="text-2xl font-bold tabular-nums leading-none text-emerald-600">
            {loadingResumen ? "…" : `${resumen?.margen_pct_con_aporte?.toFixed(1) ?? "—"}%`}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">{fmtCLP(resumen?.total_margen_con_aporte)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Aporte estimado total</p>
          <p className="text-2xl font-bold tabular-nums leading-none text-blue-600">
            {loadingResumen ? "…" : fmtCLP(resumen?.total_aporte)}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">solo marcas de terceros</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Puntos de margen ganados</p>
          <p className="text-2xl font-bold tabular-nums leading-none">
            {loadingResumen || resumen?.margen_pct_bruto == null || resumen?.margen_pct_con_aporte == null
              ? "…"
              : `+${(resumen.margen_pct_con_aporte - resumen.margen_pct_bruto).toFixed(1)}pp`}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">bruto → con aporte</p>
        </div>
      </div>

      {/* Trend chart */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Evolución margen bruto vs. con aporte (24 meses)</h3>
        {loadingTendencia ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        ) : tendencia.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
            Sin datos para el período seleccionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={tendencia} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="anio_mes"
                tickFormatter={fmtMes}
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
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Line
                type="monotone"
                dataKey="margen_pct_bruto"
                name="Margen bruto %"
                stroke="oklch(0.62 0.20 358)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="margen_pct_con_aporte"
                name="Margen c/ aporte %"
                stroke="oklch(0.72 0.14 142)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-brand table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
          <h3 className="text-sm font-semibold">Margen con aporte por marca</h3>
          <button
            onClick={() => setSoloTerceros(v => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {soloTerceros ? "Mostrar marcas propias" : "Solo marcas de terceros"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b">
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Marca</th>
                <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Ingreso</th>
                <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Margen bruto</th>
                <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">% Aporte</th>
                <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Aporte $</th>
                <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Margen c/ aporte</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingPorMarca ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 rounded bg-muted animate-pulse" /></td></tr>
                ))
              ) : marcasVisibles.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Sin datos con los filtros actuales</td></tr>
              ) : (
                marcasVisibles.map(m => (
                  <tr key={m.marca_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {m.marca_nombre}
                      {m.propia && <Badge variant="secondary" className="ml-2 text-[10px]">propia</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCLP(m.total_ingreso)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {fmtCLP(m.total_margen_bruto)}
                      <span className="text-xs text-muted-foreground ml-1">({m.margen_pct_bruto?.toFixed(1) ?? "—"}%)</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {m.propia ? "—" : `${m.aporte_pct.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">
                      {m.propia ? "—" : fmtCLP(m.total_aporte)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">
                      {fmtCLP(m.total_margen_con_aporte)}
                      <span className="text-xs text-muted-foreground ml-1 font-normal">
                        ({m.margen_pct_con_aporte?.toFixed(1) ?? "—"}%)
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
