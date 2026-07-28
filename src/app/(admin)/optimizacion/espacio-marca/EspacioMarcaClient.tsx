"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Papa from "papaparse"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type EspacioMarcaRow = {
  marca_id: string
  marca_nombre: string
  slots_actuales: number
  pct_espacio: number
  total_ingreso: number
  pct_ventas: number
  avg_gmroi: number
  slots_optimos: number
}

type TiendaOption = { id: string; nombre: string; canal: string; region: string }

const CANAL_LABEL: Record<string, string> = {
  mall: "Mall",
  calle: "Calle",
  outlet: "Outlet",
}

function gmroiBadge(v: number) {
  if (v >= 3)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
  if (v >= 2)
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
}

function fmtCLP(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n)
}

async function fetchTiendas(): Promise<TiendaOption[]> {
  const sb = createClient()
  const { data, error } = await sb
    .from("tiendas")
    .select("id, nombre, canal, region")
    .eq("activa", true)
    .order("nombre")
  if (error) throw error
  return (data ?? []) as TiendaOption[]
}

async function fetchEspacioMarca(filters: {
  tiendaId: string | null
  canal: string | null
  region: string | null
}): Promise<EspacioMarcaRow[]> {
  const sb = createClient()
  const { data, error } = await (sb.rpc as any)("get_espacio_marca", {
    p_tienda_id: filters.tiendaId,
    p_canal: filters.canal,
    p_region: filters.region,
  })
  if (error) throw error
  return (data ?? []) as EspacioMarcaRow[]
}

export function EspacioMarcaClient() {
  const { data: tiendas = [] } = useQuery({
    queryKey: ["tiendas_espacio_marca"],
    queryFn: fetchTiendas,
    staleTime: 30 * 60 * 1000,
  })

  const [tiendaId, setTiendaId] = useState("all")
  const [canal, setCanal] = useState("all")
  const [region, setRegion] = useState("all")

  const canales = useMemo(() => [...new Set(tiendas.map(t => t.canal))].sort(), [tiendas])
  const regiones = useMemo(() => [...new Set(tiendas.map(t => t.region))].sort(), [tiendas])

  const { data = [], isLoading } = useQuery({
    queryKey: ["espacio_marca", tiendaId, canal, region],
    queryFn: () => fetchEspacioMarca({
      tiendaId: tiendaId === "all" ? null : tiendaId,
      canal: canal === "all" ? null : canal,
      region: region === "all" ? null : region,
    }),
    staleTime: 5 * 60 * 1000,
  })

  const totalSlots = data.reduce((s, r) => s + (r.slots_actuales ?? 0), 0)

  function handleExport() {
    const csv = Papa.unparse(
      data.map((r) => ({
        Marca: r.marca_nombre,
        "Slots actuales": r.slots_actuales,
        "% Espacio": r.pct_espacio,
        "Ingreso total": r.total_ingreso,
        "% Ventas": r.pct_ventas,
        "GMROI promedio": r.avg_gmroi,
        "Slots óptimos": r.slots_optimos,
        "Δ Slots": r.slots_optimos - r.slots_actuales,
      }))
    )
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "espacio-por-marca.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Header + filtros */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">
            Distribución de espacio por marca
          </h3>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="secondary" className="text-xs">
              {data.length} marcas · {totalSlots} slots totales
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          Exportar CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="Todas las regiones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las regiones</SelectItem>
            {regiones.map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="Todos los canales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los canales</SelectItem>
            {canales.map(c => (
              <SelectItem key={c} value={c}>{CANAL_LABEL[c] ?? c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tiendaId} onValueChange={setTiendaId}>
          <SelectTrigger className="w-56 h-9">
            <SelectValue placeholder="Todas las tiendas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tiendas</SelectItem>
            {tiendas.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap">
                  Marca
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap min-w-48">
                  Espacio actual
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap min-w-48">
                  Ventas
                </th>
                <th className="text-center px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap">
                  GMROI
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap min-w-40">
                  Espacio óptimo
                </th>
                <th className="text-center px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap">
                  Δ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 rounded bg-muted animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    Sin datos de espacio disponibles con los filtros actuales
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const delta = row.slots_optimos - row.slots_actuales
                  return (
                    <tr key={row.marca_id} className="hover:bg-muted/30 transition-colors">
                      {/* Marca */}
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {row.marca_nombre}
                      </td>

                      {/* Espacio actual */}
                      <td className="px-4 py-3">
                        <div className="w-full bg-muted rounded h-2 mb-1.5">
                          <div
                            className="h-2 rounded"
                            style={{
                              width: `${Math.min(row.pct_espacio, 100)}%`,
                              background: "var(--brand-magenta, #d4177a)",
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {row.slots_actuales} slots ({row.pct_espacio?.toFixed(1)}%)
                        </span>
                      </td>

                      {/* Ventas */}
                      <td className="px-4 py-3">
                        <div className="w-full bg-muted rounded h-2 mb-1.5">
                          <div
                            className="h-2 rounded bg-emerald-500"
                            style={{ width: `${Math.min(row.pct_ventas, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ${(row.total_ingreso / 1000).toFixed(0)}K ({row.pct_ventas?.toFixed(1)}%)
                        </span>
                      </td>

                      {/* GMROI */}
                      <td className="px-4 py-3 text-center">
                        <Badge className={cn("tabular-nums font-bold text-xs", gmroiBadge(row.avg_gmroi))}>
                          {row.avg_gmroi?.toFixed(2)}×
                        </Badge>
                      </td>

                      {/* Espacio óptimo */}
                      <td className="px-4 py-3">
                        <div
                          className="w-full rounded h-2 mb-1.5 border-2 border-blue-400"
                          style={{ position: "relative" }}
                        >
                          <div
                            className="h-full rounded bg-blue-100 dark:bg-blue-900/30"
                            style={{
                              width: `${Math.min(
                                (row.slots_optimos / Math.max(totalSlots, 1)) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {row.slots_optimos} slots
                        </span>
                      </td>

                      {/* Delta */}
                      <td className="px-4 py-3 text-center">
                        {delta === 0 ? (
                          <Badge variant="secondary" className="text-xs">
                            =
                          </Badge>
                        ) : delta > 0 ? (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            +{delta}
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                            {delta}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          Exportar CSV
        </Button>
      </div>
    </div>
  )
}
