"use client"

import { useQuery } from "@tanstack/react-query"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { gmroiColor, sellthruColor } from "@/lib/kpi/types"

const fmtCLP = (v: number | null) => {
  if (v == null) return "—"
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v)
}

const fmtPct = (v: number | null) =>
  v == null ? "—" : `${v.toFixed(1)}%`

const fmtX = (v: number | null) =>
  v == null ? "—" : `${v.toFixed(2)}×`

type SkuRow = {
  sku_id: string
  nombre: string
  marca: string | null
  gmroi: number | null
  sellthru: number | null
  ingreso: number | null
  imagen_url: string | null
}

type SubfamiliaRow = {
  nombre: string
  ingreso: number | null
  gmroi: number | null
  n_skus: number
}

type EvolRow = {
  mes: string
  avg_gmroi: number | null
}

type CatDetalle = {
  kpis: {
    avg_gmroi: number | null
    avg_sellthru: number | null
    avg_margen_pct: number | null
    total_ingreso: number | null
    total_unidades: number | null
    n_skus: number | null
  }
  top_skus: SkuRow[]
  bottom_skus: SkuRow[]
  evolucion: EvolRow[]
  subfamilias: SubfamiliaRow[]
}

function gmroiBadgeClass(v: number | null) {
  const c = gmroiColor(v)
  return c === "green" ? "bg-emerald-100 text-emerald-800"
    : c === "yellow" ? "bg-yellow-100 text-yellow-800"
    : c === "red"    ? "bg-red-100 text-red-700"
    : "bg-muted text-muted-foreground"
}

function SkuTableRow({ sku, warn }: { sku: SkuRow; warn?: boolean }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 pr-2">
        {sku.imagen_url
          ? <img src={sku.imagen_url} alt="" className="h-8 w-8 rounded object-cover" />
          : <div className="h-8 w-8 rounded bg-muted" />
        }
      </td>
      <td className="py-1.5 pr-2">
        <p className="text-xs font-medium leading-tight line-clamp-2">{sku.nombre}</p>
        {sku.marca && <p className="text-[10px] text-muted-foreground">{sku.marca}</p>}
      </td>
      <td className="py-1.5 pr-2 text-right">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${gmroiBadgeClass(sku.gmroi)}`}>
          {fmtX(sku.gmroi)}
        </span>
      </td>
      <td className="py-1.5 pr-2 text-right text-xs text-muted-foreground">
        {fmtPct(sku.sellthru)}
      </td>
      <td className="py-1.5 text-right text-xs tabular-nums">
        {fmtCLP(sku.ingreso)}
      </td>
      {warn && (
        <td className="py-1.5 pl-2 text-center text-xs">
          <span title="Bajo GMROI">⚠️</span>
        </td>
      )}
    </tr>
  )
}

interface Props {
  categoriaId: string | null
  nombre: string
  open: boolean
  onClose: () => void
}

export function CategoriaDetailSheet({ categoriaId, nombre, open, onClose }: Props) {
  const sb = createClient()

  const { data, isLoading } = useQuery<CatDetalle | null>({
    queryKey: ["cat-detalle", categoriaId],
    queryFn: async () => {
      if (!categoriaId) return null
      const { data, error } = await (sb.rpc as any)("get_categoria_detalle", {
        p_categoria_id: categoriaId,
        p_meses: 6,
      })
      if (error) throw error
      return data as CatDetalle
    },
    enabled: open && !!categoriaId,
    staleTime: 5 * 60 * 1000,
  })

  const kpis = data?.kpis
  const maxSubIngreso = Math.max(
    ...(data?.subfamilias ?? []).map(s => s.ingreso ?? 0), 1
  )

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="sticky top-0 z-10 bg-popover border-b px-5 py-4">
          <SheetTitle className="text-base">{nombre}</SheetTitle>
          {kpis && (
            <div className="flex flex-wrap gap-3 pt-1">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">GMROI</p>
                <p className={`text-sm font-bold ${gmroiColor(kpis.avg_gmroi) === "green" ? "text-emerald-600" : gmroiColor(kpis.avg_gmroi) === "yellow" ? "text-yellow-600" : "text-red-600"}`}>
                  {fmtX(kpis.avg_gmroi)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sellthru</p>
                <p className="text-sm font-bold">{fmtPct(kpis.avg_sellthru)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Margen</p>
                <p className="text-sm font-bold">{fmtPct(kpis.avg_margen_pct)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ingreso</p>
                <p className="text-sm font-bold tabular-nums">{fmtCLP(kpis.total_ingreso)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">SKUs</p>
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
            {/* Evolución GMROI */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Evolución GMROI (6m)</h3>
              <div className="rounded-xl border bg-card p-3">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data.evolucion}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip
                      formatter={(v) => [typeof v === "number" ? `${v.toFixed(2)}×` : "—", "GMROI"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg_gmroi"
                      stroke="#d4177a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="GMROI"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Subfamilias */}
            {data.subfamilias.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Desglose por subfamilia</h3>
                <div className="rounded-xl border bg-card p-3">
                  <ResponsiveContainer width="100%" height={Math.max(200, data.subfamilias.length * 36)}>
                    <BarChart
                      data={data.subfamilias}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10 }}
                        tickFormatter={v =>
                          v >= 1_000_000
                            ? `$${(v / 1_000_000).toFixed(0)}M`
                            : v >= 1_000
                            ? `$${(v / 1_000).toFixed(0)}K`
                            : `$${v}`
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="nombre"
                        tick={{ fontSize: 10 }}
                        width={110}
                      />
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
                        <SkuTableRow key={sku.sku_id} sku={sku} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Bottom 5 SKUs */}
            {data.bottom_skus.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  Bottom 5 SKUs
                  <Badge variant="destructive" className="text-[10px]">Bajo GMROI</Badge>
                </h3>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted text-muted-foreground text-[10px] uppercase tracking-wide">
                        <th className="py-1.5 px-2 text-left w-10"></th>
                        <th className="py-1.5 px-2 text-left">SKU</th>
                        <th className="py-1.5 px-2 text-right">GMROI</th>
                        <th className="py-1.5 px-2 text-right">Sellthru</th>
                        <th className="py-1.5 px-2 text-right">Ingreso</th>
                        <th className="py-1.5 px-2 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bottom_skus.map(sku => (
                        <SkuTableRow key={sku.sku_id} sku={sku} warn />
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
