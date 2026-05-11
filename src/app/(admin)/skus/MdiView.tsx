"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type SkuMdi = {
  sku_id: string
  nombre: string
  marca_nombre: string | null
  categoria_nombre: string | null
  imagen_url: string | null
  precio_lista: number | null
  mdi_actual: number | null
  stock_actual: number | null
  avg_ventas_mensual: number | null
  valor_inventario: number | null
}

type Filtro = "todos" | "riesgo" | "obsoletos"

function mdiConfig(mdi: number | null): {
  label: string
  classes: string
} {
  if (mdi == null) return { label: "—", classes: "bg-muted text-muted-foreground" }
  if (mdi < 2)
    return {
      label: `${mdi.toFixed(1)} meses`,
      classes:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    }
  if (mdi <= 4)
    return {
      label: `${mdi.toFixed(1)} meses`,
      classes:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    }
  if (mdi <= 6)
    return {
      label: `${mdi.toFixed(1)} meses`,
      classes:
        "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    }
  return {
    label: `${mdi.toFixed(1)} meses`,
    classes:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  }
}

function fmtCLP(n: number | null) {
  if (n == null) return "—"
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n)
}

const PILL_BASE =
  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border"
const PILL_ACTIVE =
  "border-transparent text-white"
const PILL_INACTIVE =
  "border-border bg-background text-muted-foreground hover:bg-muted"

export function MdiView() {
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const sb = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ["skus_mdi"],
    queryFn: async () => {
      const { data, error } = await (sb.rpc as any)("get_skus_mdi", {})
      if (error) throw error
      return (data ?? []) as SkuMdi[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const allSkus = data ?? []

  const filtered = allSkus.filter((s) => {
    if (filtro === "riesgo") return (s.mdi_actual ?? 0) > 4
    if (filtro === "obsoletos") return (s.mdi_actual ?? 0) > 6
    return true
  })

  const pills: Array<{ key: Filtro; label: string }> = [
    { key: "todos", label: "Todos" },
    { key: "riesgo", label: "En riesgo (>4m)" },
    { key: "obsoletos", label: "Obsoletos (>6m)" },
  ]

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {pills.map((p) => (
          <button
            key={p.key}
            onClick={() => setFiltro(p.key)}
            className={cn(
              PILL_BASE,
              filtro === p.key
                ? cn(PILL_ACTIVE, "bg-[#d4177a] border-[#d4177a]")
                : PILL_INACTIVE
            )}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {filtered.length} SKUs
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-40 rounded-xl border text-muted-foreground text-sm">
          Sin SKUs para el filtro seleccionado
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((sku) => {
            const mdi = mdiConfig(sku.mdi_actual)
            return (
              <Card key={sku.sku_id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Top row: image + name */}
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded overflow-hidden bg-muted shrink-0">
                      {sku.imagen_url ? (
                        <Image
                          src={sku.imagen_url}
                          alt={sku.nombre}
                          width={64}
                          height={64}
                          className="w-16 h-16 object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-16 h-16 bg-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm leading-tight truncate">
                        {sku.nombre}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {sku.marca_nombre ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* MDI badge */}
                  <div className="flex justify-center">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full px-4 py-1.5 text-base font-bold tabular-nums",
                        mdi.classes
                      )}
                    >
                      {mdi.label}
                    </span>
                  </div>

                  {/* Stock + value */}
                  <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                    <span>
                      Stock:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {sku.stock_actual?.toLocaleString("es-CL") ?? "—"}
                      </span>
                    </span>
                    <span>
                      Valor:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {fmtCLP(sku.valor_inventario)}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
