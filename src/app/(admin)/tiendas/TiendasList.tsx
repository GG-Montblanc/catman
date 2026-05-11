"use client"

import { useState } from "react"
import Link from "next/link"
import { gmroiColor } from "@/lib/kpi/types"
import { TiendaDetailSheet } from "./TiendaDetailSheet"

export type TiendaKpi = {
  tienda_id: string
  nombre: string
  ciudad: string
  region: string
  canal: string
  formato: string
  avg_gmroi: number
  avg_sellthru: number
  avg_margen_pct: number
  total_ingreso: number
  total_unidades: number
  n_skus_activos: number
  rank_gmroi: number
}

const FORMATOS = ["Todos", "DBS Beauty Store", "Tiendas MakeUp", "Prismology"]

const fmtCLP = (v: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v)

const fmtPct = (v: number) => `${Number(v).toFixed(1)}%`
const fmtX   = (v: number) => `${Number(v).toFixed(2)}×`

function canalBadge(canal: string) {
  const lower = (canal ?? "").toLowerCase()
  if (lower.includes("mall"))   return "bg-blue-100 text-blue-800 border-blue-200"
  if (lower.includes("calle"))  return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (lower.includes("outlet")) return "bg-orange-100 text-orange-800 border-orange-200"
  return "bg-muted text-muted-foreground border-border"
}

function formatoBadge(formato: string) {
  if (formato === "DBS Beauty Store") return "bg-[#d4177a]/10 text-[#d4177a] border-[#d4177a]/30"
  if (formato === "Tiendas MakeUp")   return "bg-purple-100 text-purple-800 border-purple-200"
  if (formato === "Prismology")       return "bg-sky-100 text-sky-800 border-sky-200"
  return "bg-muted text-muted-foreground border-border"
}

function gmroiBadgeClass(v: number) {
  const c = gmroiColor(v)
  return c === "green"  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
       : c === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-200"
       : c === "red"    ? "bg-red-100 text-red-700 border-red-200"
       : "bg-muted text-muted-foreground"
}

interface Props {
  tiendas: TiendaKpi[]
}

export function TiendasList({ tiendas }: Props) {
  const [formatoActivo, setFormatoActivo] = useState("Todos")
  const [selected, setSelected] = useState<TiendaKpi | null>(null)

  const filtered = formatoActivo === "Todos"
    ? tiendas
    : tiendas.filter(t => t.formato === formatoActivo)

  const maxIngreso = Math.max(...filtered.map(t => t.total_ingreso), 1)

  return (
    <>
      {/* Filtros de formato */}
      <div className="flex flex-wrap gap-2">
        {FORMATOS.map(f => (
          <button
            key={f}
            onClick={() => setFormatoActivo(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              formatoActivo === f
                ? "bg-[#d4177a] text-white border-[#d4177a]"
                : "border-border text-muted-foreground hover:border-[#d4177a]/50 hover:text-foreground"
            }`}
          >
            {f}
            {f !== "Todos" && (
              <span className="ml-1 opacity-60">
                ({tiendas.filter(t => t.formato === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed text-muted-foreground text-sm">
          Sin tiendas con ventas en este formato
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map(tienda => (
            <button
              key={tienda.tienda_id}
              onClick={() => setSelected(tienda)}
              className="group text-left rounded-xl border bg-card p-4 hover:border-[#d4177a]/50 hover:shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4177a]/40"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">{tienda.nombre}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {tienda.ciudad} · {tienda.region}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-semibold rounded border px-1.5 py-0.5 ${gmroiBadgeClass(tienda.avg_gmroi)}`}>
                  #{tienda.rank_gmroi} en {tienda.formato.split(" ")[0]}
                </span>
              </div>

              {/* Canal + Formato badges */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${canalBadge(tienda.canal)}`}>
                  {tienda.canal}
                </span>
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${formatoBadge(tienda.formato)}`}>
                  {tienda.formato}
                </span>
              </div>

              {/* KPI row */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${gmroiBadgeClass(tienda.avg_gmroi)}`}>
                  GMROI {fmtX(tienda.avg_gmroi)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ST {fmtPct(tienda.avg_sellthru)}
                </span>
                <span className="ml-auto text-xs font-semibold tabular-nums">
                  {fmtCLP(tienda.total_ingreso)}
                </span>
              </div>

              {/* Barra proporcional */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#d4177a] transition-all"
                  style={{ width: `${(tienda.total_ingreso / maxIngreso) * 100}%` }}
                />
              </div>

              {/* Footer */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{tienda.n_skus_activos} SKUs activos</span>
                <span>{tienda.total_unidades.toLocaleString("es-CL")} uds.</span>
              </div>

              {/* Análisis link */}
              <div className="mt-2 pt-2 border-t border-border/50 flex justify-end">
                <Link
                  href={`/tiendas/${tienda.tienda_id}`}
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] font-medium text-[#d4177a] hover:underline"
                >
                  Ver análisis →
                </Link>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <TiendaDetailSheet
          tiendaId={selected.tienda_id}
          nombre={selected.nombre}
          ciudad={selected.ciudad}
          formato={selected.formato}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
