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
} from "recharts"
import { gmroiColor } from "@/lib/kpi/types"

// ── Types ────────────────────────────────────────────────────────────────────

type CategoriaDetalle = {
  categoria_id: string
  nombre: string
  kpis: {
    avg_gmroi: number
    avg_sellthru: number
    avg_margen_pct: number
    total_ingreso: number
    total_unidades: number
  }
  top_skus: Array<{
    sku_id: string
    nombre: string
    marca: string
    gmroi: number
    sellthru: number
    ingreso: number
    imagen_url: string
  }>
  bottom_skus: Array<{
    sku_id: string
    nombre: string
    marca: string
    gmroi: number
    imagen_url: string
  }>
  evolucion_mensual: Array<{ mes: string; avg_gmroi: number }>
  subfamilias: Array<{ nombre: string; ingreso: number; gmroi: number; n_skus: number }>
}

interface Props {
  data: CategoriaDetalle | null
  categoriaId: string
  nombre: string
  slug: string
}

// ── Formatters ────────────────────────────────────────────────────────────────

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

function gmroiBadgeClass(v: number | null, variant: "green" | "red") {
  if (v == null) return "bg-muted text-muted-foreground"
  if (variant === "green") return "bg-emerald-100 text-emerald-800"
  return "bg-red-100 text-red-700"
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  )
}

function gmroiTextColor(v: number | null) {
  const c = gmroiColor(v)
  if (c === "green")  return "text-emerald-600"
  if (c === "yellow") return "text-yellow-600"
  if (c === "red")    return "text-red-600"
  return "text-foreground"
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CategoriaDetalleClient({ data, categoriaId: _categoriaId, nombre, slug }: Props) {
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-muted-foreground text-sm">
        Sin datos disponibles para esta categoría
      </div>
    )
  }

  const { kpis, top_skus, bottom_skus, evolucion_mensual, subfamilias } = data

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">{nombre}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Columna izquierda (2/3) ───────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Row 4 KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="GMROI"
              value={fmtX(kpis.avg_gmroi)}
              color={gmroiTextColor(kpis.avg_gmroi)}
            />
            <KpiCard
              label="Sellthru"
              value={fmtPct(kpis.avg_sellthru)}
            />
            <KpiCard
              label="Margen"
              value={fmtPct(kpis.avg_margen_pct)}
            />
            <KpiCard
              label="Ingreso total"
              value={fmtCLP(kpis.total_ingreso)}
            />
          </div>

          {/* LineChart evolución GMROI mensual */}
          <section>
            <h2 className="text-sm font-semibold mb-2">Evolución GMROI (6 meses)</h2>
            <div className="rounded-xl border bg-card p-3">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={evolucion_mensual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip
                    formatter={(v) => [
                      typeof v === "number" ? `${v.toFixed(2)}×` : "—",
                      "GMROI",
                    ]}
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

          {/* BarChart horizontal ingreso por subfamilia */}
          {subfamilias.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-2">Ingreso por subfamilia</h2>
              <div className="rounded-xl border bg-card p-3">
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(200, subfamilias.length * 36)}
                >
                  <BarChart
                    data={subfamilias}
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
                      dataKey="nombre"
                      tick={{ fontSize: 10 }}
                      width={110}
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
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800">
                    {fmtX(sku.gmroi)}
                  </span>
                </li>
              ))}
              {top_skus.length === 0 && (
                <li className="px-4 py-3 text-xs text-muted-foreground">Sin datos</li>
              )}
            </ul>
          </div>

          {/* Bottom 5 SKUs */}
          <div className="rounded-xl border bg-card">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <h2 className="text-sm font-semibold">Bottom 5 SKUs</h2>
              <span className="text-base" title="Bajo GMROI">⚠️</span>
            </div>
            <ul className="divide-y">
              {bottom_skus.map((sku) => (
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
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700">
                      {fmtX(sku.gmroi)}
                    </span>
                    <span className="text-sm" title="Bajo GMROI">⚠️</span>
                  </div>
                </li>
              ))}
              {bottom_skus.length === 0 && (
                <li className="px-4 py-3 text-xs text-muted-foreground">Sin datos</li>
              )}
            </ul>
          </div>

          {/* Link a todos los SKUs */}
          <Link
            href={`/skus?categoria=${slug}`}
            className="flex items-center justify-center rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground hover:border-[#d4177a]/50 hover:text-[#d4177a] transition-colors"
          >
            Ver todos los SKUs de esta categoría →
          </Link>
        </div>
      </div>
    </div>
  )
}
