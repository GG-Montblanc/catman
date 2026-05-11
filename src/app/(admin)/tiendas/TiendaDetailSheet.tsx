"use client"

import { useQuery } from "@tanstack/react-query"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { gmroiColor } from "@/lib/kpi/types"

const fmtCLP = (v: number | null) => {
  if (v == null) return "—"
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v)
}

const fmtPct = (v: number | null) => (v == null ? "—" : `${Number(v).toFixed(1)}%`)
const fmtX   = (v: number | null) => (v == null ? "—" : `${Number(v).toFixed(2)}×`)

type TiendaKpis = {
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  total_ingreso: number | null
  total_unidades: number | null
  n_skus: number | null
}

type Benchmark = {
  avg_gmroi: number | null
  avg_sellthru: number | null
  avg_margen_pct: number | null
  avg_ingreso: number | null
}

type TopCat = {
  nombre: string
  ingreso: number | null
  gmroi: number | null
}

type EvolRow = {
  mes: string
  gmroi_tienda: number | null
  gmroi_formato: number | null
}

type SkuRow = {
  sku_id: string
  nombre: string
  marca: string | null
  gmroi: number | null
  sellthru: number | null
  ingreso: number | null
  imagen_url: string | null
}

type TiendaDetalle = {
  kpis: TiendaKpis
  benchmark: Benchmark
  top_cats: TopCat[]
  evolucion: EvolRow[]
  top_skus: SkuRow[]
}

function DeltaArrow({ tienda, bench }: { tienda: number | null; bench: number | null }) {
  if (tienda == null || bench == null) return null
  const delta = tienda - bench
  if (Math.abs(delta) < 0.05) return <span className="text-muted-foreground text-xs">≈</span>
  return delta > 0
    ? <span className="text-emerald-600 text-xs">↑</span>
    : <span className="text-red-500 text-xs">↓</span>
}

function gmroiBadgeClass(v: number | null) {
  const c = gmroiColor(v)
  return c === "green"  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
       : c === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-200"
       : c === "red"    ? "bg-red-100 text-red-700 border-red-200"
       : "bg-muted text-muted-foreground"
}

interface Props {
  tiendaId: string | null
  nombre: string
  ciudad: string
  formato: string
  open: boolean
  onClose: () => void
}

export function TiendaDetailSheet({ tiendaId, nombre, ciudad, formato, open, onClose }: Props) {
  const sb = createClient()

  const { data, isLoading } = useQuery<TiendaDetalle | null>({
    queryKey: ["tienda-detalle", tiendaId],
    queryFn: async () => {
      if (!tiendaId) return null
      const { data, error } = await (sb.rpc as any)("get_tienda_detalle", {
        p_tienda_id: tiendaId,
        p_meses: 6,
      })
      if (error) throw error
      return data as TiendaDetalle
    },
    enabled: open && !!tiendaId,
    staleTime: 5 * 60 * 1000,
  })

  const kpis  = data?.kpis
  const bench = data?.benchmark

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="sticky top-0 z-10 bg-popover border-b px-5 py-4">
          <SheetTitle className="text-base">{nombre}</SheetTitle>
          <p className="text-xs text-muted-foreground -mt-0.5">{ciudad} · {formato}</p>

          {kpis && bench && (
            <div className="flex flex-wrap gap-4 pt-2">
              {/* GMROI vs benchmark */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">GMROI</p>
                <div className="flex items-center gap-1">
                  <p className={`text-sm font-bold ${gmroiColor(kpis.avg_gmroi) === "green" ? "text-emerald-600" : gmroiColor(kpis.avg_gmroi) === "yellow" ? "text-yellow-600" : "text-red-600"}`}>
                    {fmtX(kpis.avg_gmroi)}
                  </p>
                  <DeltaArrow tienda={kpis.avg_gmroi} bench={bench.avg_gmroi} />
                  <span className="text-[10px] text-muted-foreground">
                    prom. {fmtX(bench.avg_gmroi)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Sellthru</p>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold">{fmtPct(kpis.avg_sellthru)}</p>
                  <DeltaArrow tienda={kpis.avg_sellthru} bench={bench.avg_sellthru} />
                  <span className="text-[10px] text-muted-foreground">prom. {fmtPct(bench.avg_sellthru)}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Ingreso</p>
                <p className="text-sm font-bold tabular-nums">{fmtCLP(kpis.total_ingreso)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">SKUs activos</p>
                <p className="text-sm font-bold">{kpis.n_skus ?? "—"}</p>
              </div>
            </div>
          )}
        </SheetHeader>

        {isLoading && (
          <div className="p-5 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && data && (
          <div className="px-5 py-4 space-y-6">
            {/* Evolución GMROI: tienda vs formato */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Evolución GMROI — tienda vs promedio formato</h3>
              <div className="rounded-xl border bg-card p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.evolucion}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip
                      formatter={(v, name) => [typeof v === "number" ? `${v.toFixed(2)}×` : "—", String(name)]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="gmroi_tienda"
                      stroke="#d4177a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Esta tienda"
                    />
                    <Line
                      type="monotone"
                      dataKey="gmroi_formato"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      name="Prom. formato"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Top categorías */}
            {data.top_cats.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Top 5 categorías por ingreso</h3>
                <div className="rounded-xl border bg-card p-3">
                  <ResponsiveContainer width="100%" height={Math.max(160, data.top_cats.length * 36)}>
                    <BarChart
                      data={data.top_cats}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10 }}
                        tickFormatter={v =>
                          v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(0)}M`
                          : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K`
                          : `$${v}`
                        }
                      />
                      <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={110} />
                      <Tooltip
                        formatter={(v) => [typeof v === "number" ? fmtCLP(v) : "—", "Ingreso"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="ingreso" fill="#d4177a" radius={[0, 4, 4, 0]} name="Ingreso" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Top 10 SKUs */}
            {data.top_skus.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Top 10 SKUs por GMROI</h3>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wide">
                        <th className="py-1.5 px-2 text-left w-10"></th>
                        <th className="py-1.5 px-2 text-left">SKU</th>
                        <th className="py-1.5 px-2 text-right">GMROI</th>
                        <th className="py-1.5 px-2 text-right">Sellthru</th>
                        <th className="py-1.5 px-2 text-right">Ingreso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_skus.map(sku => (
                        <tr key={sku.sku_id} className="border-b last:border-0">
                          <td className="py-1.5 px-2">
                            {sku.imagen_url
                              ? <img src={sku.imagen_url} alt="" className="h-8 w-8 rounded object-cover" />
                              : <div className="h-8 w-8 rounded bg-muted" />
                            }
                          </td>
                          <td className="py-1.5 px-2">
                            <p className="font-medium leading-tight line-clamp-2">{sku.nombre}</p>
                            {sku.marca && <p className="text-[10px] text-muted-foreground">{sku.marca}</p>}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${gmroiBadgeClass(sku.gmroi)}`}>
                              {fmtX(sku.gmroi)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right text-muted-foreground">
                            {fmtPct(sku.sellthru)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">
                            {fmtCLP(sku.ingreso)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
