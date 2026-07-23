"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Papa from "papaparse"
import { ChevronDown, ChevronRight, Download, ShoppingCart } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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

type GrupoMarca = {
  marca: string
  items: ComprasRow[]
  totalUnidades: number
  totalValor: number
}

function fmtCLP(n: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)
}

async function fetchCompras(): Promise<ComprasRow[]> {
  const sb = createClient()
  const { data, error } = await (sb.rpc as any)("get_compras_sugeridas", {})
  if (error) throw error
  return (data ?? []) as ComprasRow[]
}

export function PedidoPorMarcaTable() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["compras_sugeridas"],
    queryFn: fetchCompras,
    staleTime: 5 * 60 * 1000,
  })

  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())

  const grupos = useMemo<GrupoMarca[]>(() => {
    const byMarca = new Map<string, ComprasRow[]>()
    for (const row of data) {
      const marca = row.marca_nombre ?? "Sin marca"
      if (!byMarca.has(marca)) byMarca.set(marca, [])
      byMarca.get(marca)!.push(row)
    }
    return Array.from(byMarca.entries())
      .map(([marca, items]) => ({
        marca,
        items: items.sort((a, b) => b.valor_orden - a.valor_orden),
        totalUnidades: items.reduce((s, r) => s + r.unidades_sugeridas, 0),
        totalValor: items.reduce((s, r) => s + r.valor_orden, 0),
      }))
      .sort((a, b) => b.totalValor - a.totalValor)
  }, [data])

  const totalGeneral = grupos.reduce((s, g) => s + g.totalValor, 0)
  const totalSkus = data.length

  function toggle(marca: string) {
    setExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(marca)) next.delete(marca)
      else next.add(marca)
      return next
    })
  }

  function exportCsv() {
    const rowsData = grupos.flatMap(g =>
      g.items.map(r => ({
        Marca: g.marca,
        SKU: r.nombre,
        "Stock actual": r.stock_actual,
        "MDI (meses)": r.mdi_actual,
        "Venta prom/mes": r.avg_ventas_mensual,
        "Unidades sugeridas": r.unidades_sugeridas,
        "Valor orden (CLP)": r.valor_orden,
      }))
    )
    const csv = Papa.unparse(rowsData)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pedido_por_marca_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        Sin órdenes de compra sugeridas con los filtros actuales.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-[var(--brand-magenta,#d4177a)]/10 p-2">
            <ShoppingCart className="h-4 w-4 text-[var(--brand-magenta,#d4177a)]" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {grupos.length} marca{grupos.length !== 1 ? "s" : ""} · {totalSkus} SKU{totalSkus !== 1 ? "s" : ""} para reponer
            </p>
            <p className="text-xs text-muted-foreground">Valor total estimado del pedido</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums">{fmtCLP(totalGeneral)}</span>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Grupos por marca */}
      <div className="space-y-2">
        {grupos.map(g => {
          const open = expandidas.has(g.marca)
          return (
            <div key={g.marca} className="rounded-xl border bg-card overflow-hidden">
              <button
                onClick={() => toggle(g.marca)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="font-semibold text-sm truncate">{g.marca}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {g.items.length} SKU{g.items.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                    {g.totalUnidades.toLocaleString("es-CL")} ud.
                  </span>
                  <span className="text-sm font-bold tabular-nums">{fmtCLP(g.totalValor)}</span>
                </div>
              </button>

              {open && (
                <div className="border-t divide-y">
                  {g.items.map(item => {
                    const c = mdiColor(item.mdi_actual)
                    return (
                      <div key={item.sku_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight truncate">{item.nombre}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={cn("tabular-nums text-[10px]", MDI_BADGE[c])}>
                              MDI {item.mdi_actual?.toFixed(1) ?? "—"}m
                            </Badge>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              stock {item.stock_actual?.toLocaleString("es-CL") ?? "—"} u. · venta prom {item.avg_ventas_mensual?.toFixed(0) ?? "—"} u/mes
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">{item.unidades_sugeridas.toLocaleString("es-CL")} ud.</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{fmtCLP(item.valor_orden)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
