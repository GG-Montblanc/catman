"use client"

import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { SkuConKpis } from "@/lib/kpi/types"
import { gmroiColor, mdiColor } from "@/lib/kpi/types"
import { cn } from "@/lib/utils"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts"
import { holtWinters } from "@/lib/forecast/holt-winters"
import { format, addMonths, parseISO } from "date-fns"
import { es } from "date-fns/locale"

const PAGE_SIZE = 50

const ORDER_MAP: Record<string, string> = {
  "avg_gmroi_desc":      "gmroi_desc",
  "avg_gmroi_asc":       "gmroi_asc",
  "avg_sellthru_pct_desc": "sellthru_desc",
  "avg_mdi_meses_desc":  "mdi_desc",
  "total_ingreso_desc":  "ingreso_desc",
}

function getClient() {
  return createClient()
}

async function fetchSkus(buscar: string, orden: string, page: number) {
  const sb = getClient()
  const { data, error } = await (sb.rpc as any)("get_skus_con_kpis", {
    p_buscar: buscar || null,
    p_orden: ORDER_MAP[orden] ?? "gmroi_desc",
    p_offset: page * PAGE_SIZE,
    p_limit: PAGE_SIZE,
  })
  if (error) throw error
  return data as { total: number; skus: SkuConKpis[] | null }
}

const col = createColumnHelper<SkuConKpis>()

const GMROI_BADGE: Record<string, string> = {
  green:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  yellow: "bg-amber-100   text-amber-800   dark:bg-amber-900/40   dark:text-amber-300",
  red:    "bg-rose-100    text-rose-800    dark:bg-rose-900/40    dark:text-rose-300",
  gray:   "bg-muted       text-muted-foreground",
}

const MDI_BADGE: Record<string, string> = {
  green:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  yellow: "bg-amber-100   text-amber-800   dark:bg-amber-900/40   dark:text-amber-300",
  orange: "bg-orange-100  text-orange-800  dark:bg-orange-900/40  dark:text-orange-300",
  red:    "bg-rose-100    text-rose-800    dark:bg-rose-900/40    dark:text-rose-300",
}

function fmtCLP(v: number | null) {
  if (v == null) return "—"
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v)
}

function SortIcon({ state }: { state: false | "asc" | "desc" }) {
  if (!state) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
  if (state === "asc") return <ChevronUp className="h-3.5 w-3.5" />
  return <ChevronDown className="h-3.5 w-3.5" />
}

export function SkuTable() {
  const [buscar, setBuscar]   = useState("")
  const [debouncedBuscar, setDebouncedBuscar] = useState("")
  const [page, setPage]       = useState(0)
  const [sorting, setSorting] = useState<SortingState>([{ id: "avg_gmroi", desc: true }])
  const [selected, setSelected] = useState<SkuConKpis | null>(null)

  // Debounce search
  const handleSearch = useCallback((v: string) => {
    setBuscar(v)
    clearTimeout((handleSearch as any)._t)
    ;(handleSearch as any)._t = setTimeout(() => {
      setDebouncedBuscar(v)
      setPage(0)
    }, 300)
  }, [])

  const ordenKey = sorting[0]
    ? `${sorting[0].id}_${sorting[0].desc ? "desc" : "asc"}`
    : "avg_gmroi_desc"

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["skus_table", debouncedBuscar, ordenKey, page],
    queryFn:  () => fetchSkus(debouncedBuscar, ordenKey, page),
    staleTime: 3 * 60 * 1000,
    placeholderData: (prev) => prev,
  })

  const skus    = data?.skus ?? []
  const total   = data?.total ?? 0
  const pages   = Math.ceil(total / PAGE_SIZE)

  const columns = [
    col.display({
      id: "imagen",
      header: "",
      size: 48,
      cell: ({ row }) => (
        <div className="h-10 w-10 rounded overflow-hidden bg-muted flex-shrink-0">
          {row.original.imagen_url ? (
            <Image
              src={row.original.imagen_url}
              alt={row.original.nombre}
              width={40} height={40}
              className="object-cover h-10 w-10"
              unoptimized
            />
          ) : (
            <div className="h-10 w-10 bg-muted" />
          )}
        </div>
      ),
    }),
    col.accessor("nombre", {
      header: "Nombre",
      cell: ({ getValue, row }) => (
        <div>
          <p className="font-medium text-sm leading-tight line-clamp-2 max-w-48">
            {getValue()}
          </p>
          {row.original.marca_nombre && (
            <p className="text-xs text-muted-foreground">{row.original.marca_nombre}</p>
          )}
        </div>
      ),
    }),
    col.accessor("categoria_nombre", {
      header: "Categoría",
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">{getValue() ?? "—"}</span>
      ),
    }),
    col.accessor("precio_lista", {
      header: "Precio",
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{fmtCLP(getValue())}</span>
      ),
    }),
    col.accessor("avg_gmroi", {
      header: "GMROI",
      enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue()
        const c = gmroiColor(v)
        return (
          <Badge className={cn("tabular-nums font-bold", GMROI_BADGE[c])}>
            {v?.toFixed(2) ?? "—"}×
          </Badge>
        )
      },
    }),
    col.accessor("avg_sellthru_pct", {
      header: "Sellthru",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue()?.toFixed(1) ?? "—"}%</span>
      ),
    }),
    col.accessor("avg_s2s", {
      header: "S2S",
      cell: ({ getValue }) => {
        const v = getValue()
        return <span className="tabular-nums text-sm">{v != null ? (v * 100).toFixed(1) : "—"}%</span>
      },
    }),
    col.accessor("avg_margen_pct", {
      header: "Margen",
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue()?.toFixed(1) ?? "—"}%</span>
      ),
    }),
    col.accessor("avg_fill_rate", {
      header: "Fill Rate",
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue()?.toFixed(1) ?? "—"}%</span>
      ),
    }),
    col.accessor("avg_mdi_meses", {
      header: "MDI",
      enableSorting: true,
      cell: ({ getValue }) => {
        const v = getValue()
        const c = mdiColor(v)
        return (
          <Badge className={cn("tabular-nums text-xs", MDI_BADGE[c])}>
            {v?.toFixed(1) ?? "—"}m
          </Badge>
        )
      },
    }),
    col.accessor("total_ingreso", {
      header: "Ingreso",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{fmtCLP(getValue())}</span>
      ),
    }),
  ]

  const table = useReactTable({
    data: skus,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting(updater)
      setPage(0)
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: pages,
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o marca..."
            value={buscar}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString("es-CL")} SKUs
          {isFetching && !isLoading && " · Actualizando…"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(hg => (
                <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                  {hg.headers.map(h => (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "text-xs font-semibold whitespace-nowrap",
                        h.column.getCanSort() && "cursor-pointer select-none"
                      )}
                      onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getCanSort() && (
                          <SortIcon state={h.column.getIsSorted()} />
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {columns.map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 rounded bg-muted animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : skus.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground text-sm">
                        {debouncedBuscar ? `Sin resultados para "${debouncedBuscar}"` : "Sin datos. Ejecuta seed:fake para cargar datos sintéticos."}
                      </TableCell>
                    </TableRow>
                  )
                  : table.getRowModel().rows.map(row => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(row.original)}
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id} className="py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
              }
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString("es-CL")}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)}>
              «
            </Button>
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              ‹
            </Button>
            <span className="px-3 py-1 text-xs border rounded-md bg-card">
              {page + 1} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
              ›
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>
              »
            </Button>
          </div>
        </div>
      )}

      {/* SKU Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && <SkuDetailPanel sku={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast chart component — runs Holt-Winters client-side
// ─────────────────────────────────────────────────────────────────────────────
function SkuForecastChart({ skuId }: { skuId: string }) {
  const sb = createClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ["sku_forecast", skuId],
    queryFn: async () => {
      // Fetch last 24 months of aggregated monthly sales
      const since = format(addMonths(new Date(), -24), "yyyy-MM-01")
      const { data: rows, error } = await sb
        .from("ventas_fact")
        .select("anio_mes, unidades, ingreso")
        .eq("sku_id", skuId)
        .gte("anio_mes", since)
        .order("anio_mes", { ascending: true })

      if (error) throw error

      // Aggregate across stores by month
      const byMonth = new Map<string, { unidades: number; ingreso: number }>()
      for (const r of rows ?? []) {
        const key = r.anio_mes.slice(0, 7) // "YYYY-MM"
        const cur = byMonth.get(key) ?? { unidades: 0, ingreso: 0 }
        cur.unidades += r.unidades ?? 0
        cur.ingreso  += r.ingreso  ?? 0
        byMonth.set(key, cur)
      }

      const months    = Array.from(byMonth.keys()).sort()
      const unidades  = months.map(m => byMonth.get(m)!.unidades)
      const ingresos  = months.map(m => byMonth.get(m)!.ingreso)

      if (months.length === 0) return null

      // Run Holt-Winters for 6-month forecast
      const hwU = holtWinters(unidades, { horizon: 6 })
      const hwI = holtWinters(ingresos,  { horizon: 6 })

      // Build chart data — historical + forecast
      const lastMonth = months[months.length - 1]
      const lastDate  = parseISO(lastMonth + "-01")

      const histPoints = months.map((m, i) => ({
        mes:        format(parseISO(m + "-01"), "MMM yy", { locale: es }),
        unidades:   Math.round(unidades[i]),
        ingreso:    Math.round(ingresos[i]),
        forecast_u: null as number | null,
        forecast_i: null as number | null,
        tipo:       "real" as "real" | "forecast",
      }))

      // Bridge point (last real = first forecast)
      const bridgePoint = {
        mes:        histPoints[histPoints.length - 1].mes,
        unidades:   null as number | null,
        ingreso:    null as number | null,
        forecast_u: Math.round(histPoints[histPoints.length - 1].unidades),
        forecast_i: Math.round(histPoints[histPoints.length - 1].ingreso),
        tipo:       "forecast" as const,
      }

      const forecastPoints = hwU.forecast.map((fu, i) => ({
        mes:        format(addMonths(lastDate, i + 1), "MMM yy", { locale: es }),
        unidades:   null as number | null,
        ingreso:    null as number | null,
        forecast_u: Math.round(fu),
        forecast_i: Math.round(hwI.forecast[i]),
        tipo:       "forecast" as const,
      }))

      const tendencia: "creciente" | "estable" | "decreciente" = (() => {
        const last3 = hwU.forecast.slice(3)
        const first3 = hwU.forecast.slice(0, 3)
        const avgLast  = last3.reduce((a, b) => a + b, 0) / last3.length
        const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length
        const delta = (avgLast - avgFirst) / (avgFirst || 1)
        if (delta > 0.05)  return "creciente"
        if (delta < -0.05) return "decreciente"
        return "estable"
      })()

      return {
        points: [...histPoints, bridgePoint, ...forecastPoints],
        mape:   hwU.mape,
        tendencia,
        forecastStartIdx: histPoints.length,
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <div className="h-44 animate-pulse rounded-lg bg-muted" />
  if (error || !data) return <p className="text-xs text-muted-foreground">Sin datos de ventas.</p>

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Pronóstico de ventas (6 meses)</h4>
        <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
          <TrendIcon className="h-3.5 w-3.5" />
          <span className="capitalize">{data.tendencia}</span>
          {data.mape > 0 && (
            <span className="text-muted-foreground font-normal ml-1">MAPE {data.mape.toFixed(0)}%</span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data.points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 10 }} width={48} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(val, name) => [
              typeof val === "number" ? val.toLocaleString("es-CL") : "—",
              name === "unidades" ? "Real (u)" :
              name === "forecast_u" ? "Pronóstico (u)" :
              name === "ingreso" ? "Real ($)" : "Pronóstico ($)",
            ]}
          />
          {firstForecastMes && (
            <ReferenceLine
              x={firstForecastMes}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{ value: "hoy", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            />
          )}
          <Line
            type="monotone"
            dataKey="unidades"
            stroke="#d4177a"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            name="unidades"
          />
          <Line
            type="monotone"
            dataKey="forecast_u"
            stroke="#d4177a"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={true}
            name="forecast_u"
          />
          <Legend
            iconType="line"
            iconSize={12}
            formatter={(v) =>
              v === "unidades" ? "Real" :
              v === "forecast_u" ? "Pronóstico" : v
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SKU Detail panel (drawer content)
// ─────────────────────────────────────────────────────────────────────────────
function SkuDetailPanel({ sku }: { sku: SkuConKpis }) {
  return (
    <>
      <SheetHeader className="mb-6">
        <div className="flex gap-4 items-start">
          {sku.imagen_url && (
            <Image
              src={sku.imagen_url}
              alt={sku.nombre}
              width={80} height={80}
              className="rounded-lg object-cover w-20 h-20 border"
              unoptimized
            />
          )}
          <div>
            <SheetTitle className="leading-tight">{sku.nombre}</SheetTitle>
            <p className="text-sm text-muted-foreground mt-0.5">{sku.marca_nombre}</p>
            <p className="text-xs text-muted-foreground">{sku.categoria_ruta}</p>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "GMROI",      value: sku.avg_gmroi?.toFixed(2), unit: "×",    color: gmroiColor(sku.avg_gmroi) },
            { label: "Sellthru",   value: sku.avg_sellthru_pct?.toFixed(1), unit: "%", color: "gray" as const },
            { label: "S2S",        value: sku.avg_s2s != null ? (sku.avg_s2s * 100).toFixed(1) : null, unit: "%", color: "gray" as const },
            { label: "Margen",     value: sku.avg_margen_pct?.toFixed(1), unit: "%", color: "gray" as const },
            { label: "Días Stock", value: sku.avg_dias_stock?.toFixed(0), unit: " días", color: "gray" as const },
            { label: "Fill Rate",  value: sku.avg_fill_rate?.toFixed(1), unit: "%", color: "gray" as const },
            { label: "MDI",        value: sku.avg_mdi_meses?.toFixed(1), unit: " meses", color: "gray" as const },
            { label: "Precio lista", value: sku.precio_lista != null
              ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(sku.precio_lista)
              : null,
              unit: "", color: "gray" as const },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className={cn(
              "rounded-lg border p-3",
              color === "green" && "border-l-4 border-emerald-500",
              color === "yellow" && "border-l-4 border-amber-400",
              color === "red" && "border-l-4 border-rose-500",
            )}>
              <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
              <p className="text-xl font-bold tabular-nums">
                {value ?? "—"}{value ? unit : ""}
              </p>
            </div>
          ))}
        </div>

        {/* Revenue */}
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="text-sm font-semibold">Ingresos (últimos 12m)</h4>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ingreso total</span>
            <span className="font-semibold tabular-nums">
              {sku.total_ingreso != null
                ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(sku.total_ingreso)
                : "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Margen total</span>
            <span className="font-semibold tabular-nums text-emerald-600">
              {sku.total_margen != null
                ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(sku.total_margen)
                : "—"}
            </span>
          </div>
        </div>

        {/* Forecast chart */}
        <div className="rounded-lg border p-4">
          <SkuForecastChart skuId={sku.id} />
        </div>

        {/* MDI badge */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Estado de inventario</h4>
          {(() => {
            const c = mdiColor(sku.avg_mdi_meses)
            const labels = {
              green:  "Rotación sana (MDI < 3 meses)",
              yellow: "Acumulación moderada (3–6 meses)",
              orange: "Alto inventario (6–12 meses)",
              red:    "Obsolescencia crítica (> 12 meses)",
            }
            const classes = {
              green:  "bg-emerald-50 text-emerald-800 border-emerald-200",
              yellow: "bg-amber-50 text-amber-800 border-amber-200",
              orange: "bg-orange-50 text-orange-800 border-orange-200",
              red:    "bg-rose-50 text-rose-800 border-rose-200",
            }
            return (
              <div className={cn("rounded-lg border px-4 py-3 text-sm font-medium", classes[c])}>
                {labels[c]}
              </div>
            )
          })()}
        </div>
      </div>
    </>
  )
}
