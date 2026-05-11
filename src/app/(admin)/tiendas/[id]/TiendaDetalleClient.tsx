"use client"

import Link from "next/link"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts"
import { gmroiColor } from "@/lib/kpi/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type TiendaDetalle = {
  tienda_id: string
  nombre: string
  kpis: {
    avg_gmroi: number
    avg_sellthru: number
    avg_margen_pct: number
    total_ingreso: number
  }
  benchmark_formato: {
    avg_gmroi: number
    avg_sellthru: number
    avg_margen_pct: number
  }
  top_categorias: Array<{ categoria_nombre: string; ingreso: number; avg_gmroi: number }>
  evolucion_mensual: Array<{ mes: string; avg_gmroi: number; benchmark_gmroi: number }>
  top_skus: Array<{
    sku_id: string
    nombre: string
    marca: string
    gmroi: number
    imagen_url: string
  }>
}

type TiendaInfo = {
  nombre: string
  ciudad: string
  region: string
  canal: string
  formato: string
}

interface Props {
  data: TiendaDetalle | null
  tiendaId: string
  tiendaInfo: TiendaInfo
}

// ── Formatters ─────────────────────────────────────────────────────────────────

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

function gmroiTextColor(v: number | null) {
  const c = gmroiColor(v)
  if (c === "green")  return "text-emerald-600"
  if (c === "yellow") return "text-yellow-600"
  if (c === "red")    return "text-red-600"
  return "text-foreground"
}

function gmroiBadgeClass(v: number | null) {
  const c = gmroiColor(v)
  return c === "green"  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
       : c === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-200"
       : c === "red"    ? "bg-red-100 text-red-700 border-red-200"
       : "bg-muted text-muted-foreground"
}

// ── Badge helpers ──────────────────────────────────────────────────────────────

function canalBadgeClass(canal: string) {
  const lower = (canal ?? "").toLowerCase()
  if (lower.includes("mall"))   return "bg-blue-100 text-blue-700"
  if (lower.includes("calle"))  return "bg-green-100 text-green-700"
  if (lower.includes("outlet")) return "bg-orange-100 text-orange-700"
  return "bg-muted text-muted-foreground"
}

function formatoBadgeClass(formato: string) {
  if (formato === "DBS Beauty Store") return "bg-[#d4177a]/10 text-[#d4177a]"
  if (formato === "Tiendas MakeUp")   return "bg-purple-100 text-purple-800"
  if (formato === "Prismology")       return "bg-sky-100 text-sky-800"
  return "bg-muted text-muted-foreground"
}

// ── Delta arrow ────────────────────────────────────────────────────────────────

function DeltaArrow({ tienda, bench }: { tienda: number; bench: number }) {
  const delta = tienda - bench
  if (Math.abs(delta) < 0.05)
    return <span className="text-muted-foreground text-xs">≈</span>
  return delta > 0
    ? <span className="text-emerald-600 text-xs font-semibold">↑</span>
    : <span className="text-rose-600 text-xs font-semibold">↓</span>
}

// ── KPI Comparison Card ────────────────────────────────────────────────────────

function KpiCompCard({
  label,
  tienda,
  bench,
  fmt,
  tiendaColor,
}: {
  label: string
  tienda: number | null
  bench: number | null
  fmt: (v: number | null) => string
  tiendaColor?: string
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className={`text-xl font-bold tabular-nums ${tiendaColor ?? "text-foreground"}`}>
          {fmt(tienda)}
        </p>
        {tienda != null && bench != null && (
          <DeltaArrow tienda={tienda} bench={bench} />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Formato: <span className="tabular-nums">{fmt(bench)}</span>
      </p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function TiendaDetalleClient({ data, tiendaId, tiendaInfo }: Props) {
  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-5">{tiendaInfo.nombre}</h1>
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-muted-foreground text-sm">
          Sin datos disponibles para esta tienda
        </div>
      </div>
    )
  }

  const { kpis, benchmark_formato, top_categorias, evolucion_mensual, top_skus } = data

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">{tiendaInfo.nombre}</h1>
      <p className="text-sm text-muted-foreground mb-5">
        {tiendaInfo.ciudad} · {tiendaInfo.region}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Columna izquierda (2/3) ───────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Row 4 KPI cards con comparación vs benchmark formato */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCompCard
              label="GMROI"
              tienda={kpis.avg_gmroi}
              bench={benchmark_formato.avg_gmroi}
              fmt={fmtX}
              tiendaColor={gmroiTextColor(kpis.avg_gmroi)}
            />
            <KpiCompCard
              label="Sellthru"
              tienda={kpis.avg_sellthru}
              bench={benchmark_formato.avg_sellthru}
              fmt={fmtPct}
            />
            <KpiCompCard
              label="Margen"
              tienda={kpis.avg_margen_pct}
              bench={benchmark_formato.avg_margen_pct}
              fmt={fmtPct}
            />
            <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Ingreso total
              </p>
              <p className="text-xl font-bold tabular-nums">{fmtCLP(kpis.total_ingreso)}</p>
            </div>
          </div>

          {/* LineChart evolución mensual: tienda vs promedio formato */}
          <section>
            <h2 className="text-sm font-semibold mb-2">
              Evolución GMROI — tienda vs promedio formato
            </h2>
            <div className="rounded-xl border bg-card p-3">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={evolucion_mensual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip
                    formatter={(v, name) => [
                      typeof v === "number" ? `${v.toFixed(2)}×` : "—",
                      String(name),
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="avg_gmroi"
                    stroke="#d4177a"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Esta tienda"
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark_gmroi"
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Prom. formato"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* BarChart top 5 categorías por ingreso */}
          {top_categorias.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-2">Top 5 categorías por ingreso</h2>
              <div className="rounded-xl border bg-card p-3">
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(200, top_categorias.length * 40)}
                >
                  <BarChart
                    data={top_categorias}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `$${(v / 1_000_000).toFixed(0)}M`
                          : v >= 1_000
                          ? `$${(v / 1_000).toFixed(0)}K`
                          : `$${v}`
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="categoria_nombre"
                      tick={{ fontSize: 10 }}
                      width={120}
                    />
                    <Tooltip
                      formatter={(v) => [
                        typeof v === "number" ? fmtCLP(v) : "—",
                        "Ingreso",
                      ]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar
                      dataKey="ingreso"
                      fill="#d4177a"
                      radius={[0, 4, 4, 0]}
                      name="Ingreso"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>

        {/* ── Columna derecha (1/3) ────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Info tienda */}
          <div className="rounded-xl border bg-card px-4 py-4 space-y-3">
            <h2 className="text-sm font-semibold">Información de la tienda</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">Ciudad</dt>
                <dd className="font-medium">{tiendaInfo.ciudad}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">Región</dt>
                <dd className="font-medium">{tiendaInfo.region}</dd>
              </div>
              <div className="flex justify-between items-start gap-2">
                <dt className="text-muted-foreground shrink-0">Canal</dt>
                <dd>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${canalBadgeClass(tiendaInfo.canal)}`}
                  >
                    {tiendaInfo.canal}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between items-start gap-2">
                <dt className="text-muted-foreground shrink-0">Formato</dt>
                <dd>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${formatoBadgeClass(tiendaInfo.formato)}`}
                  >
                    {tiendaInfo.formato}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Top 10 SKUs */}
          <div className="rounded-xl border bg-card">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Top 10 SKUs</h2>
            </div>
            <ul className="divide-y">
              {top_skus.map((sku) => (
                <li key={sku.sku_id} className="flex items-center gap-3 px-4 py-2">
                  {sku.imagen_url ? (
                    <img
                      src={sku.imagen_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded bg-muted" />
                  )}
                  <p className="flex-1 min-w-0 text-xs font-medium truncate">{sku.nombre}</p>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold ${gmroiBadgeClass(sku.gmroi)}`}
                  >
                    {fmtX(sku.gmroi)}
                  </span>
                </li>
              ))}
              {top_skus.length === 0 && (
                <li className="px-4 py-3 text-xs text-muted-foreground">Sin datos</li>
              )}
            </ul>
          </div>

          {/* Link a planogramas */}
          <Link
            href={`/planogramas?tienda=${tiendaId}`}
            className="flex items-center justify-center rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground hover:border-[#d4177a]/50 hover:text-[#d4177a] transition-colors"
          >
            Otros planogramas de esta tienda →
          </Link>
        </div>
      </div>
    </div>
  )
}
