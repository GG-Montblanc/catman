"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { gmroiColor, sellthruColor } from "@/lib/kpi/types"
import { CategoriaDetailSheet } from "./CategoriaDetailSheet"

export type CategoriaKpi = {
  categoria_id: string
  nombre: string
  nivel: number
  parent_nombre: string | null
  n_skus: number
  avg_gmroi: number
  avg_sellthru: number
  avg_margen_pct: number
  total_ingreso: number
  total_unidades: number
  tendencia_gmroi: "up" | "flat" | "down"
}

const fmtCLP = (v: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v)

const fmtPct = (v: number) => `${Number(v).toFixed(1)}%`
const fmtX   = (v: number) => `${Number(v).toFixed(2)}×`

function gmroiBadgeClass(v: number) {
  const c = gmroiColor(v)
  return c === "green"  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
       : c === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-200"
       : c === "red"    ? "bg-red-100 text-red-700 border-red-200"
       : "bg-muted text-muted-foreground"
}

function TrendIcon({ t }: { t: "up" | "flat" | "down" }) {
  if (t === "up")   return <span className="text-emerald-600 font-bold text-sm">▲</span>
  if (t === "down") return <span className="text-red-500 font-bold text-sm">▼</span>
  return <span className="text-muted-foreground font-bold text-sm">—</span>
}

interface Props {
  categorias: CategoriaKpi[]
}

export function CategoriasList({ categorias }: Props) {
  const [selected, setSelected] = useState<CategoriaKpi | null>(null)
  const maxIngreso = Math.max(...categorias.map(c => c.total_ingreso), 1)

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {categorias.map(cat => (
          <button
            key={cat.categoria_id}
            onClick={() => setSelected(cat)}
            className="group text-left rounded-xl border bg-card p-4 hover:border-[#d4177a]/50 hover:shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4177a]/40"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight truncate">{cat.nombre}</p>
                {cat.parent_nombre && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {cat.parent_nombre}
                  </p>
                )}
              </div>
              <TrendIcon t={cat.tendencia_gmroi} />
            </div>

            {/* KPI row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${gmroiBadgeClass(cat.avg_gmroi)}`}>
                GMROI {fmtX(cat.avg_gmroi)}
              </span>
              <span className="text-xs text-muted-foreground">
                ST {fmtPct(cat.avg_sellthru)}
              </span>
              <span className="text-xs text-muted-foreground">
                Mg {fmtPct(cat.avg_margen_pct)}
              </span>
              <span className="ml-auto text-xs font-semibold tabular-nums">
                {fmtCLP(cat.total_ingreso)}
              </span>
            </div>

            {/* Barra de ingreso proporcional */}
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#d4177a] transition-all"
                style={{ width: `${(cat.total_ingreso / maxIngreso) * 100}%` }}
              />
            </div>

            {/* Footer */}
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{cat.n_skus} SKUs</span>
              <span>{cat.total_unidades.toLocaleString("es-CL")} uds.</span>
            </div>
          </button>
        ))}
      </div>

      <CategoriaDetailSheet
        categoriaId={selected?.categoria_id ?? null}
        nombre={selected?.nombre ?? ""}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
