"use client"

import Link from "next/link"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { gmroiColor } from "@/lib/kpi/types"
import type { PosicionAgregada, TercioAgregado } from "./page"

function fmtCLP(v: number) {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const GMROI_BADGE = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  gray: "bg-muted text-muted-foreground",
}

const TERCIO_LABEL: Record<TercioAgregado["tercio"], string> = {
  izquierda: "Izquierda",
  centro: "Centro",
  derecha: "Derecha",
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <p className="font-medium mb-1">Bandeja {label}</p>
      <p className="text-muted-foreground">GMROI: <span className="font-semibold text-foreground">{p.avg_gmroi?.toFixed(2) ?? "—"}×</span></p>
      <p className="text-muted-foreground">Sellthru: <span className="font-semibold text-foreground">{p.avg_sellthru?.toFixed(1) ?? "—"}%</span></p>
      <p className="text-muted-foreground">Ingreso: <span className="font-semibold text-foreground">{fmtCLP(p.total_ingreso)}</span></p>
      <p className="text-muted-foreground">{p.n_slots} posiciones analizadas</p>
    </div>
  )
}

function barColor(g: number | null) {
  const c = gmroiColor(g)
  if (c === "green") return "#10b981"
  if (c === "yellow") return "#f59e0b"
  if (c === "red") return "#f43f5e"
  return "#9ca3af"
}

export function ReportePosicionClient({
  bandejas,
  tercios,
  nPlanogramas,
}: {
  bandejas: PosicionAgregada[]
  tercios: TercioAgregado[]
  nPlanogramas: number
}) {
  const eyeLevel = new Set([2, 3])

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <Link href="/planogramas" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-4" />
          Volver a planogramas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Ventas por posición</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          GMROI y sellthru promedio agregados por posición física, cruzando los {nPlanogramas} planogramas activos —
          valida si las reglas de negocio (ej. "eye level rinde más") se cumplen en la práctica.
        </p>
      </div>

      {bandejas.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin datos suficientes — necesitas al menos un planograma con KPIs calculados.
        </div>
      ) : (
        <>
          {/* Por bandeja */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">GMROI promedio por bandeja</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Bandejas resaltadas (⭐) son las configuradas como "eye level" en la mayoría de los planogramas
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bandejas} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="bandeja"
                  tickFormatter={(b: number) => `B${b}${eyeLevel.has(b) ? " ⭐" : ""}`}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avg_gmroi" radius={[4, 4, 0, 0]}>
                  {bandejas.map((b, i) => (
                    <Cell key={i} fill={barColor(b.avg_gmroi)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla por bandeja */}
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Bandeja</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground">Posiciones</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground">Ingreso total</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground">Sellthru</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-xs text-muted-foreground">GMROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bandejas.map(b => (
                    <tr key={b.bandeja} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">
                        Bandeja {b.bandeja} {eyeLevel.has(b.bandeja) && <span title="Eye level">⭐</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{b.n_slots}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCLP(b.total_ingreso)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.avg_sellthru?.toFixed(1) ?? "—"}%</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge className={`tabular-nums font-bold ${GMROI_BADGE[gmroiColor(b.avg_gmroi)]}`}>
                          {b.avg_gmroi?.toFixed(2) ?? "—"}×
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por tercio horizontal */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">Por posición horizontal (izquierda / centro / derecha)</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Posición normalizada dentro de cada bandeja, independiente del número de posiciones del planograma
            </p>
            <div className="grid grid-cols-3 gap-3">
              {tercios.map(t => (
                <div key={t.tercio} className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{TERCIO_LABEL[t.tercio]}</p>
                  <Badge className={`tabular-nums font-bold text-base ${GMROI_BADGE[gmroiColor(t.avg_gmroi)]}`}>
                    {t.avg_gmroi?.toFixed(2) ?? "—"}×
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {t.avg_sellthru?.toFixed(1) ?? "—"}% sellthru · {fmtCLP(t.total_ingreso)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
