"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Package, ShoppingCart, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PedidoItem = {
  sku_id: string
  sku_nombre: string
  marca_nombre: string | null
  imagen_url: string | null
  precio_lista: number | null
  frentes_total: number
  stock_actual: number
  venta_mensual: number
  semanas_target: number
  unidades_target: number
  unidades_pedir: number
  costo_estimado: number
}

const fmtCLP = (v: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v)

const fmtN = (v: number) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(v)

export function PedidoClient({
  planogramaId, nombre, tienda, ciudad, categoria, items,
}: {
  planogramaId: string
  nombre: string
  tienda: string
  ciudad: string
  categoria: string
  items: PedidoItem[]
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(items.map(i => i.sku_id))
  )

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectedItems = useMemo(
    () => items.filter(i => selected.has(i.sku_id)),
    [items, selected]
  )

  const totalUnidades = selectedItems.reduce((s, i) => s + i.unidades_pedir, 0)
  const totalCosto    = selectedItems.reduce((s, i) => s + i.costo_estimado, 0)

  function exportCSV() {
    const rows = [
      ["SKU", "Marca", "Stock actual", "Venta/mes", "A pedir", "Costo estimado"],
      ...selectedItems.map(i => [
        i.sku_nombre,
        i.marca_nombre ?? "",
        i.stock_actual,
        fmtN(i.venta_mensual),
        i.unidades_pedir,
        fmtCLP(i.costo_estimado),
      ]),
    ]
    const csv = rows.map(r => r.join(";")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `pedido-${nombre.replace(/\s+/g, "-")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/planogramas" className="hover:text-foreground">Planogramas</Link>
        <span>/</span>
        <Link href={`/planogramas/${planogramaId}/simulador`} className="hover:text-foreground">{nombre}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Pedido sugerido</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pedido sugerido</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tienda} · {ciudad} · {categoria}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Cobertura target: 10 semanas · basado en ventas últimos 2 meses
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">SKUs a pedir</p>
          <p className="text-2xl font-bold mt-1">{selectedItems.length}</p>
          <p className="text-xs text-muted-foreground">de {items.length} en planograma</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total unidades</p>
          <p className="text-2xl font-bold mt-1">{fmtN(totalUnidades)}</p>
          <p className="text-xs text-muted-foreground">unidades a ordenar</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Costo estimado</p>
          <p className="text-2xl font-bold mt-1 text-[#d4177a]">{fmtCLP(totalCosto)}</p>
          <p className="text-xs text-muted-foreground">costo de reposición</p>
        </div>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold">Sin reposición necesaria</p>
          <p className="text-sm text-muted-foreground mt-1">
            Todos los SKUs tienen stock suficiente para las próximas 10 semanas.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-muted-foreground text-xs uppercase tracking-wide border-b">
                <th className="py-3 px-3 text-left w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === items.length}
                    onChange={() =>
                      selected.size === items.length
                        ? setSelected(new Set())
                        : setSelected(new Set(items.map(i => i.sku_id)))
                    }
                    className="rounded"
                  />
                </th>
                <th className="py-3 px-3 text-left w-10" />
                <th className="py-3 px-3 text-left">Producto</th>
                <th className="py-3 px-3 text-right">Stock</th>
                <th className="py-3 px-3 text-right">Venta/mes</th>
                <th className="py-3 px-3 text-right">Target</th>
                <th className="py-3 px-3 text-right font-semibold text-foreground">A pedir</th>
                <th className="py-3 px-3 text-right">Costo est.</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const isSelected = selected.has(item.sku_id)
                const urgencia = item.stock_actual === 0
                  ? "red"
                  : item.stock_actual < item.venta_mensual
                  ? "yellow"
                  : "normal"

                return (
                  <tr
                    key={item.sku_id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer",
                      !isSelected && "opacity-50"
                    )}
                    onClick={() => toggle(item.sku_id)}
                  >
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(item.sku_id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="h-10 w-10 rounded-lg border bg-muted overflow-hidden">
                        {item.imagen_url
                          ? <img src={item.imagen_url} alt="" className="h-10 w-10 object-contain p-1" />
                          : <div className="h-10 w-10 flex items-center justify-center">
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                        }
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium leading-tight line-clamp-2 max-w-xs">{item.sku_nombre}</p>
                      {item.marca_nombre && (
                        <p className="text-xs text-muted-foreground">{item.marca_nombre}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      <span className={cn(
                        "inline-flex items-center gap-1",
                        urgencia === "red" && "text-red-600 font-bold",
                        urgencia === "yellow" && "text-amber-600 font-semibold",
                      )}>
                        {urgencia === "red" && <TrendingDown className="h-3 w-3" />}
                        {fmtN(item.stock_actual)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                      {fmtN(item.venta_mensual)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                      {fmtN(item.unidades_target)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      <span className="font-bold text-[#d4177a] text-base">
                        {fmtN(item.unidades_pedir)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-muted-foreground text-xs">
                      {fmtCLP(item.costo_estimado)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer total */}
      {selectedItems.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-muted/50 border px-5 py-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-muted-foreground">SKUs seleccionados</p>
              <p className="font-bold text-lg">{selectedItems.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total unidades</p>
              <p className="font-bold text-lg">{fmtN(totalUnidades)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Inversión estimada</p>
            <p className="font-bold text-xl text-[#d4177a]">{fmtCLP(totalCosto)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
