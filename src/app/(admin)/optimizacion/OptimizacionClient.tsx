"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table"
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts"
import Papa from "papaparse"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CuadranteRow } from "./page"
import { MarcaDemandaChart } from "./MarcaDemandaChart"

// ─── Types ────────────────────────────────────────────────────────────────────

type ComprasRow = {
  sku_id: string
  nombre: string
  marca_nombre: string
  stock_actual: number
  mdi_actual: number
  avg_ventas_mensual: number
  precio_lista: number
  unidades_sugeridas: number
  valor_orden: number
}

type Cuadrante = "stars" | "cashcows" | "questions" | "dogs"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCuadrante(gmroi: number, sellthru: number): Cuadrante {
  if (sellthru > 60 && gmroi > 3) return "stars"
  if (sellthru <= 60 && gmroi > 3) return "cashcows"
  if (sellthru > 60 && gmroi <= 3) return "questions"
  return "dogs"
}

const CUADRANTE_COLOR: Record<Cuadrante, string> = {
  stars:     "#22c55e",
  cashcows:  "#3b82f6",
  questions: "#eab308",
  dogs:      "#f97316",
}

const CUADRANTE_LABEL: Record<Cuadrante, string> = {
  stars:     "⭐ Stars",
  cashcows:  "🐄 Cash Cows",
  questions: "❓ Question Marks",
  dogs:      "🐕 Dogs",
}

function fmtCLP(n: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n)
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function mdiColor(v: number | null) {
  if (v == null) return "gray"
  if (v < 2)  return "green"
  if (v < 4)  return "yellow"
  if (v < 6)  return "orange"
  return "red"
}

const MDI_BADGE: Record<string, string> = {
  green:  "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100   text-amber-800",
  orange: "bg-orange-100  text-orange-800",
  red:    "bg-rose-100    text-rose-800",
  gray:   "bg-muted       text-muted-foreground",
}

function SortIcon({ state }: { state: false | "asc" | "desc" }) {
  if (!state) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
  if (state === "asc") return <ChevronUp className="h-3.5 w-3.5" />
  return <ChevronDown className="h-3.5 w-3.5" />
}

// ─── Custom Scatter Tooltip ───────────────────────────────────────────────────

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as CuadranteRow & { cuadrante: Cuadrante }
  if (!d) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-1 min-w-40">
      <p className="font-semibold text-sm leading-tight">{d.nombre}</p>
      <p className="text-muted-foreground">{d.marca_nombre}</p>
      <div className="pt-1 space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">GMROI</span>
          <span className="tabular-nums font-medium">{d.avg_gmroi?.toFixed(2)}×</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Sellthru</span>
          <span className="tabular-nums font-medium">{d.avg_sellthru?.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">MDI</span>
          <span className="tabular-nums font-medium">{d.mdi_actual?.toFixed(1)}m</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Ingreso</span>
          <span className="tabular-nums font-medium">{fmtK(d.total_ingreso ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-0.5">
          <span className="text-muted-foreground">Cuadrante</span>
          <span style={{ color: CUADRANTE_COLOR[d.cuadrante] }} className="font-semibold">
            {CUADRANTE_LABEL[d.cuadrante]}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 1: Matriz cuadrantes ─────────────────────────────────────────────────

function MatrizCuadrantes({
  data,
  tiendas,
  categorias,
}: {
  data: CuadranteRow[]
  tiendas: { id: string; nombre: string }[]
  categorias: { id: string; nombre: string }[]
}) {
  const [tiendaFiltro, setTiendaFiltro]       = useState("all")
  const [categoriaFiltro, setCategoriaFiltro] = useState("all")

  const filtered = useMemo(() => {
    return data.filter(d => {
      if (tiendaFiltro !== "all") {
        // server data doesn't carry tienda_id, skip tienda filter (data was loaded without filter)
        // This filter is a UI-only affordance for future use; for now pass through
      }
      if (categoriaFiltro !== "all" && d.categoria_nombre !== categoriaFiltro) return false
      return true
    })
  }, [data, tiendaFiltro, categoriaFiltro])

  const enriched = useMemo(() =>
    filtered.map(d => ({
      ...d,
      cuadrante: getCuadrante(d.avg_gmroi ?? 0, d.avg_sellthru ?? 0),
    })),
    [filtered]
  )

  // Quadrant stats
  const stats = useMemo(() => {
    const total = enriched.length
    const groups: Record<Cuadrante, CuadranteRow[]> = {
      stars: [], cashcows: [], questions: [], dogs: [],
    }
    for (const d of enriched) groups[d.cuadrante].push(d)
    const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) : "0.0"
    const ing = (arr: CuadranteRow[]) => arr.reduce((s, d) => s + (d.total_ingreso ?? 0), 0)
    return { groups, total, pct, ing }
  }, [enriched])

  // Recommendations
  const recommendations = useMemo(() => {
    const recs: string[] = []
    const total = stats.total
    if (total === 0) return recs

    const dogsPct  = (stats.groups.dogs.length / total) * 100
    const qPct     = (stats.groups.questions.length / total) * 100
    const starsPct = (stats.groups.stars.length / total) * 100

    if (dogsPct > 15) {
      recs.push(`⚠️ ${stats.groups.dogs.length} SKUs en cuadrante Dogs (${dogsPct.toFixed(1)}%). Considera reducir espacio o liquidar.`)
    }
    if (qPct > 20) {
      recs.push(`💡 ${stats.groups.questions.length} SKUs con alta rotación pero bajo GMROI. Revisar estructura de costos o precio.`)
    }
    if (starsPct > 30) {
      recs.push(`✅ Portafolio saludable: ${starsPct.toFixed(1)}% de SKUs en cuadrante Stars.`)
    }

    // Top 5 dogs by ingreso
    const top5dogs = [...stats.groups.dogs]
      .sort((a, b) => (b.total_ingreso ?? 0) - (a.total_ingreso ?? 0))
      .slice(0, 5)
    for (const d of top5dogs) {
      recs.push(`${d.nombre} genera ${fmtK(d.total_ingreso ?? 0)} pero tiene GMROI ${(d.avg_gmroi ?? 0).toFixed(2)}× — candidato a liquidación`)
    }

    return recs
  }, [stats])

  // Unique category names for filter
  const categoryNames = useMemo(() => {
    const names = new Set(data.map(d => d.categoria_nombre).filter(Boolean))
    return [...names].sort()
  }, [data])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={tiendaFiltro} onValueChange={setTiendaFiltro}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="Todas las tiendas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tiendas</SelectItem>
            {tiendas.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categoryNames.map(n => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground self-center">
          {enriched.length} SKUs
        </span>
      </div>

      {/* Scatter chart */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Matriz GMROI × Sellthru</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Tamaño del punto proporcional al ingreso. Líneas de referencia: Sellthru 60%, GMROI 3×
        </p>

        <div className="relative">
          {/* Quadrant labels */}
          <div className="absolute inset-0 pointer-events-none z-10" style={{ left: 60, right: 20, top: 10, bottom: 40 }}>
            <div className="absolute top-1 right-2 text-[10px] font-semibold text-emerald-600 opacity-70">⭐ Stars</div>
            <div className="absolute top-1 left-2 text-[10px] font-semibold text-blue-500 opacity-70">🐄 Cash Cows</div>
            <div className="absolute bottom-6 right-2 text-[10px] font-semibold text-yellow-600 opacity-70">❓ Question Marks</div>
            <div className="absolute bottom-6 left-2 text-[10px] font-semibold text-orange-500 opacity-70">🐕 Dogs</div>
          </div>

          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
              <XAxis
                type="number"
                dataKey="avg_sellthru"
                domain={[0, 100]}
                name="Sellthru"
                unit="%"
                label={{ value: "Sellthru (%)", position: "insideBottom", offset: -30, fontSize: 11 }}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="avg_gmroi"
                domain={[0, 6]}
                name="GMROI"
                unit="×"
                label={{ value: "GMROI", angle: -90, position: "insideLeft", fontSize: 11 }}
                tick={{ fontSize: 11 }}
              />
              <ZAxis
                type="number"
                dataKey="total_ingreso"
                range={[40, 400]}
                name="Ingreso"
              />
              <Tooltip content={<ScatterTooltip />} />
              <ReferenceLine x={60} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />
              <ReferenceLine y={3}  stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />
              <Scatter data={enriched} isAnimationActive={false}>
                {enriched.map((d, i) => (
                  <Cell key={i} fill={CUADRANTE_COLOR[d.cuadrante]} fillOpacity={0.75} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["stars", "cashcows", "questions", "dogs"] as Cuadrante[]).map(q => {
          const arr = stats.groups[q]
          return (
            <div key={q} className="rounded-xl border bg-card p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{CUADRANTE_LABEL[q]}</span>
                {q === "dogs" && arr.length > 0 && (
                  <Badge className="bg-rose-100 text-rose-800 text-[10px]">Revisar</Badge>
                )}
              </div>
              <p className="text-2xl font-bold tabular-nums"
                style={{ color: CUADRANTE_COLOR[q] }}>
                {arr.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.pct(arr.length)}% del total
              </p>
              <p className="text-xs font-medium tabular-nums">
                {fmtK(stats.ing(arr))}
              </p>
            </div>
          )
        })}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <h3 className="text-sm font-semibold">Recomendaciones</h3>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground leading-snug">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Órdenes de compra ─────────────────────────────────────────────────

async function fetchCompras(): Promise<ComprasRow[]> {
  const sb = createClient()
  const { data, error } = await (sb.rpc as any)("get_compras_sugeridas", {})
  if (error) throw error
  return (data ?? []) as ComprasRow[]
}

const col = createColumnHelper<ComprasRow>()

function ComprasTable() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["compras_sugeridas"],
    queryFn:  fetchCompras,
    staleTime: 5 * 60 * 1000,
  })

  const [sorting, setSorting] = useState<SortingState>([{ id: "valor_orden", desc: true }])
  const [globalFilter, setGlobalFilter] = useState("")

  const columns = useMemo(() => [
    col.accessor("nombre", {
      header: "SKU",
      enableSorting: true,
      cell: ({ getValue, row }) => (
        <div>
          <p className="font-medium text-sm leading-tight">{getValue()}</p>
          <p className="text-xs text-muted-foreground">{row.original.marca_nombre}</p>
        </div>
      ),
    }),
    col.accessor("marca_nombre", {
      header: "Marca",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="text-sm">{getValue()}</span>
      ),
    }),
    col.accessor("stock_actual", {
      header: "Stock actual",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue()?.toLocaleString("es-CL") ?? "—"} ud.</span>
      ),
    }),
    col.accessor("mdi_actual", {
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
    col.accessor("avg_ventas_mensual", {
      header: "Venta prom./mes",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">{getValue()?.toFixed(0) ?? "—"} ud.</span>
      ),
    }),
    col.accessor("unidades_sugeridas", {
      header: "Unidades sugeridas",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm font-semibold">{getValue()?.toLocaleString("es-CL") ?? "—"}</span>
      ),
    }),
    col.accessor("valor_orden", {
      header: "Valor orden",
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm font-semibold">{fmtCLP(getValue() ?? 0)}</span>
      ),
    }),
  ], [])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const s = filterValue.toLowerCase()
      return (
        row.original.nombre.toLowerCase().includes(s) ||
        (row.original.marca_nombre ?? "").toLowerCase().includes(s)
      )
    },
  })

  const rows = table.getRowModel().rows
  const totalOrden = rows.reduce((s, r) => s + (r.original.valor_orden ?? 0), 0)

  function exportCsv() {
    const rowsData = rows.map(r => ({
      SKU:                r.original.nombre,
      Marca:              r.original.marca_nombre,
      "Stock actual":     r.original.stock_actual,
      "MDI (meses)":      r.original.mdi_actual,
      "Venta prom/mes":   r.original.avg_ventas_mensual,
      "Unidades sugeridas": r.original.unidades_sugeridas,
      "Valor orden (CLP)": r.original.valor_orden,
    }))
    const csv = Papa.unparse(rowsData)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `compras_sugeridas_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52 max-w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar SKU o marca..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
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
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {columns.map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 rounded bg-muted animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground text-sm">
                        {globalFilter
                          ? `Sin resultados para "${globalFilter}"`
                          : "Sin órdenes de compra sugeridas con los filtros actuales."}
                      </TableCell>
                    </TableRow>
                  )
                  : rows.map(row => (
                    <TableRow key={row.id}>
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

      {/* Footer total */}
      {!isLoading && rows.length > 0 && (
        <div className="flex items-center justify-between text-sm border rounded-lg px-4 py-2.5 bg-card">
          <span className="text-muted-foreground">
            {rows.length} SKUs
          </span>
          <span className="font-semibold tabular-nums">
            Total orden estimada:{" "}
            <span className="text-foreground">{fmtCLP(totalOrden)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export function OptimizacionClient({
  cuadrante,
  tiendas,
  categorias,
}: {
  cuadrante: CuadranteRow[]
  tiendas:   { id: string; nombre: string }[]
  categorias: { id: string; nombre: string }[]
}) {
  return (
    <Tabs defaultValue="cuadrantes">
      <TabsList className="mb-5">
        <TabsTrigger value="cuadrantes">Matriz cuadrantes</TabsTrigger>
        <TabsTrigger value="compras">Órdenes de compra</TabsTrigger>
        <TabsTrigger value="cuando-comprar">Cuándo comprar (marca)</TabsTrigger>
      </TabsList>

      <TabsContent value="cuadrantes">
        <MatrizCuadrantes
          data={cuadrante}
          tiendas={tiendas}
          categorias={categorias}
        />
      </TabsContent>

      <TabsContent value="compras">
        <ComprasTable />
      </TabsContent>

      <TabsContent value="cuando-comprar">
        <MarcaDemandaChart />
      </TabsContent>
    </Tabs>
  )
}
