"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchRentabilidadAtributo } from "@/lib/kpi/queries"
import { gmroiColor } from "@/lib/kpi/types"

type Categoria = {
  id: string
  nombre: string
}

type AtributoRow = {
  atributo: string
  n_valores: number
}

type TendenciaRow = {
  valor: string
  mes: string
  total_unidades: number
  total_ingreso: number
  pct_categoria: number
}

type PivotedRow = {
  mes: string
  [key: string]: number | string
}

const COLORS = [
  "#d4177a",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
]

function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const sumX = (n * (n - 1)) / 2
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
  let sumY = 0
  let sumXY = 0
  for (let i = 0; i < n; i++) {
    sumY += values[i]
    sumXY += i * values[i]
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0
  return (n * sumXY - sumX * sumY) / denom
}

type CustomTooltipProps = {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null

  let formatted = label
  try {
    formatted = format(parseISO(label), "MMM yyyy", { locale: es })
  } catch {
    // keep raw label
  }

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-sm mb-1">{formatted}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{p.value?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

export function TendenciasClient({ categorias }: { categorias: Categoria[] }) {
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? "")
  const [atributo, setAtributo] = useState<string>("")
  const [meses, setMeses] = useState<number>(12)

  const sb = createClient()

  const { data: atributosData } = useQuery({
    queryKey: ["atributos_disponibles", categoriaId],
    queryFn: async () => {
      if (!categoriaId) return []
      const { data, error } = await (sb.rpc as any)("get_atributos_disponibles", {
        p_categoria_id: categoriaId,
      })
      if (error) throw error
      return (data ?? []) as AtributoRow[]
    },
    enabled: !!categoriaId,
    staleTime: 5 * 60 * 1000,
  })

  const atributos = atributosData ?? []

  const { data: rentabilidadData, isLoading: loadingRentabilidad } = useQuery({
    queryKey: ["rentabilidad_atributo", categoriaId, atributo, meses],
    queryFn: () => fetchRentabilidadAtributo(categoriaId, atributo, meses),
    enabled: !!categoriaId && !!atributo,
    staleTime: 5 * 60 * 1000,
  })
  const rentabilidad = rentabilidadData ?? []

  const { data: tendenciasData, isLoading: loadingTendencias } = useQuery({
    queryKey: ["tendencias_atributo", categoriaId, atributo, meses],
    queryFn: async () => {
      if (!categoriaId || !atributo) return []
      const { data, error } = await (sb.rpc as any)("get_tendencias_atributo", {
        p_categoria_id: categoriaId,
        p_atributo: atributo,
        p_meses: meses,
      })
      if (error) throw error
      return (data ?? []) as TendenciaRow[]
    },
    enabled: !!categoriaId && !!atributo,
    staleTime: 5 * 60 * 1000,
  })

  const rawRows = tendenciasData ?? []

  // Pivot: {mes, [valor]: pct_categoria, ...}
  const allValores = Array.from(new Set(rawRows.map((r) => r.valor)))
  const byMes = new Map<string, PivotedRow>()
  for (const row of rawRows) {
    if (!byMes.has(row.mes)) {
      byMes.set(row.mes, { mes: row.mes })
    }
    const entry = byMes.get(row.mes)!
    entry[row.valor] = row.pct_categoria
  }
  const chartData = Array.from(byMes.values()).sort((a, b) =>
    a.mes < b.mes ? -1 : 1
  )

  // Insights: slope over last 6 months per valor
  const insights: Array<{ valor: string; slope: number; delta: number }> = []
  for (const valor of allValores) {
    const last6 = chartData.slice(-6)
    if (last6.length < 4) continue
    const vals = last6.map((r) => (r[valor] as number) ?? 0)
    const slope = linearSlope(vals)
    const delta = vals[vals.length - 1] - vals[0]
    if (Math.abs(slope) > 0.5) {
      insights.push({ valor, slope, delta })
    }
  }

  const handleCategoriaChange = (val: string) => {
    setCategoriaId(val)
    setAtributo("")
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tendencias</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Detección de tendencias por atributo de producto
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoriaId} onValueChange={handleCategoriaChange}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={atributo}
          onValueChange={setAtributo}
          disabled={atributos.length === 0}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Atributo" />
          </SelectTrigger>
          <SelectContent>
            {atributos.map((a) => (
              <SelectItem key={a.atributo} value={a.atributo}>
                {a.atributo}
                <span className="ml-1 text-muted-foreground text-xs">
                  ({a.n_valores})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(meses)}
          onValueChange={(v) => setMeses(Number(v))}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Últimos 6m</SelectItem>
            <SelectItem value="12">Últimos 12m</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Chart area */}
      {!atributo ? (
        <Card>
          <CardContent className="flex items-center justify-center h-60 text-muted-foreground text-sm">
            Selecciona una categoría y atributo para ver la tendencia
          </CardContent>
        </Card>
      ) : loadingTendencias ? (
        <div className="h-80 rounded-xl border bg-muted animate-pulse" />
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-60 text-muted-foreground text-sm">
            Sin datos para el atributo seleccionado
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val: string) => {
                    try {
                      return format(parseISO(val), "MMM yy", { locale: es })
                    } catch {
                      return val
                    }
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  width={42}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {allValores.map((valor, idx) => (
                  <Line
                    key={valor}
                    type="monotone"
                    dataKey={valor}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Rentabilidad por valor de atributo */}
      {atributo && (
        <div className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold">Rentabilidad por valor ({atributo})</h2>
            <p className="text-xs text-muted-foreground">
              Compara GMROI y margen entre valores del atributo — no solo cuánto se vende, sino qué tan rentable es
            </p>
          </div>
          {loadingRentabilidad ? (
            <div className="h-40 rounded-xl border bg-muted animate-pulse" />
          ) : rentabilidad.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                Sin datos de rentabilidad para este atributo
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Valor</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">SKUs</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">% Ingreso</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Sellthru</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">Margen</th>
                      <th className="text-center px-4 py-2.5 font-semibold text-xs text-muted-foreground whitespace-nowrap">GMROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rentabilidad.map(r => (
                      <tr key={r.valor} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.valor}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.n_skus}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.pct_ingreso_categoria?.toFixed(1) ?? "—"}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.avg_sellthru_pct?.toFixed(1) ?? "—"}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.avg_margen_pct?.toFixed(1) ?? "—"}%</td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge
                            className={cn(
                              "tabular-nums font-bold",
                              gmroiColor(r.avg_gmroi) === "green" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : gmroiColor(r.avg_gmroi) === "yellow" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                : gmroiColor(r.avg_gmroi) === "red" ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {r.avg_gmroi?.toFixed(2) ?? "—"}×
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insights panel */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Insights de tendencia (últimos 6 meses)</h2>
          <div className="space-y-1.5">
            {insights.map(({ valor, slope, delta }) => {
              const isAlza = slope > 0
              const sign = isAlza ? "+" : ""
              return (
                <div
                  key={valor}
                  className="flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm bg-card"
                >
                  <span>{isAlza ? "📈" : "📉"}</span>
                  <span>
                    <span className="font-semibold">{valor}</span>:{" "}
                    <span className={isAlza ? "text-emerald-600" : "text-rose-600"}>
                      {sign}{delta.toFixed(1)}% en 6m
                    </span>
                    {" — "}
                    <span className="text-muted-foreground">
                      {isAlza ? "tendencia al alza" : "tendencia a la baja"}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
