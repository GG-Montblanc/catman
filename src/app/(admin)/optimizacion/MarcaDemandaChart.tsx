"use client"

import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { format, addMonths, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { holtWinters } from "@/lib/forecast/holt-winters"
import { buildPurchaseCurve } from "@/lib/forecast/purchase-curve"
import { DemandaCompraViz, type DemandaCompraData } from "@/components/forecast/DemandaCompraViz"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

type Marca = { id: string; nombre: string }

async function fetchMarcas(): Promise<Marca[]> {
  const sb = createClient()
  const { data, error } = await sb.from("marcas").select("id, nombre").order("nombre")
  if (error) throw error
  return (data ?? []) as Marca[]
}

async function fetchMarcaDemanda(marcaId: string): Promise<DemandaCompraData | null> {
  const sb = createClient()
  const since = format(addMonths(new Date(), -24), "yyyy-MM-01")

  const [ventasRes, invRes, skusRes] = await Promise.all([
    sb
      .from("ventas_fact")
      .select("anio_mes, unidades, ingreso, skus!inner(marca_id)")
      .eq("skus.marca_id", marcaId)
      .gte("anio_mes", since)
      .order("anio_mes", { ascending: true }),
    sb
      .from("inventario_fact")
      .select("stock_fin, anio_mes, skus!inner(marca_id)")
      .eq("skus.marca_id", marcaId)
      .order("anio_mes", { ascending: false })
      .limit(1000),
    sb
      .from("skus")
      .select("lead_time_dias")
      .eq("marca_id", marcaId)
      .eq("activo", true),
  ])

  if (ventasRes.error) throw ventasRes.error
  if (invRes.error) throw invRes.error
  if (skusRes.error) throw skusRes.error

  const ventasRows = (ventasRes.data ?? []) as { anio_mes: string; unidades: number; ingreso: number }[]
  const invRows    = (invRes.data ?? [])    as { anio_mes: string; stock_fin: number }[]
  const skuRows    = (skusRes.data ?? [])   as { lead_time_dias: number }[]

  // Aggregate ventas por mes (todas las tiendas y SKUs de la marca)
  const byMonth = new Map<string, { unidades: number; ingreso: number }>()
  for (const r of ventasRows) {
    const key = (r.anio_mes as string).slice(0, 7)
    const cur = byMonth.get(key) ?? { unidades: 0, ingreso: 0 }
    cur.unidades += r.unidades ?? 0
    cur.ingreso  += r.ingreso  ?? 0
    byMonth.set(key, cur)
  }

  const months   = Array.from(byMonth.keys()).sort()
  const unidades = months.map(m => byMonth.get(m)!.unidades)
  const ingresos = months.map(m => byMonth.get(m)!.ingreso)

  if (months.length === 0) return null

  // Precio promedio efectivo = ingreso total / unidades totales del período
  const totalUnidades = unidades.reduce((s, v) => s + v, 0)
  const totalIngreso  = ingresos.reduce((s, v) => s + v, 0)
  const precioPromedio = totalUnidades > 0 ? totalIngreso / totalUnidades : 0

  // Stock actual: suma de stock_fin del mes más reciente disponible
  const ultimoMesInv = invRows[0]?.anio_mes as string | undefined
  const stockActual = invRows
    .filter(r => r.anio_mes === ultimoMesInv)
    .reduce((s, r) => s + (r.stock_fin ?? 0), 0)

  // Lead time promedio de los SKUs activos de la marca
  const leadTimes = skuRows.map(r => r.lead_time_dias ?? 150)
  const leadTimeDias = leadTimes.length > 0
    ? leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length
    : 150

  const hwU = holtWinters(unidades, { horizon: 6 })

  const { stockProyectado, recomendacion } = buildPurchaseCurve({
    forecastUnidades: hwU.forecast,
    stockActual,
    precioLista: precioPromedio,
    leadTimeDias,
  })

  const lastMonth = months[months.length - 1]
  const lastDate  = parseISO(lastMonth + "-01")

  const histPoints = months.map((m, i) => ({
    mes:              format(parseISO(m + "-01"), "MMM yy", { locale: es }),
    unidades:         Math.round(unidades[i]),
    forecast_u:       null as number | null,
    stock_proyectado: null as number | null,
  }))

  const bridgePoint = {
    mes:              histPoints[histPoints.length - 1].mes,
    unidades:         null as number | null,
    forecast_u:       Math.round(histPoints[histPoints.length - 1].unidades ?? 0),
    stock_proyectado: Math.round(stockActual),
  }

  const forecastPoints = hwU.forecast.map((fu, i) => ({
    mes:              format(addMonths(lastDate, i + 1), "MMM yy", { locale: es }),
    unidades:         null as number | null,
    forecast_u:       Math.round(fu),
    stock_proyectado: Math.round(stockProyectado[i]),
  }))

  const tendencia: "creciente" | "estable" | "decreciente" = (() => {
    const last3  = hwU.forecast.slice(3)
    const first3 = hwU.forecast.slice(0, 3)
    const avgLast  = last3.reduce((a, b) => a + b, 0) / last3.length
    const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length
    const delta = (avgLast - avgFirst) / (avgFirst || 1)
    if (delta > 0.05)  return "creciente"
    if (delta < -0.05) return "decreciente"
    return "estable"
  })()

  const mesCompraLabel = recomendacion.mesCompraIdx !== null
    ? forecastPoints[recomendacion.mesCompraIdx].mes
    : null

  return {
    points: [...histPoints, bridgePoint, ...forecastPoints],
    mape: hwU.mape,
    tendencia,
    forecastStartIdx: histPoints.length,
    stockActual,
    recomendacion,
    mesCompraLabel,
  }
}

export function MarcaDemandaChart() {
  const { data: marcas = [], isLoading: loadingMarcas } = useQuery({
    queryKey: ["marcas_lista"],
    queryFn: fetchMarcas,
    staleTime: 30 * 60 * 1000,
  })

  const [marcaId, setMarcaId] = useState<string>("")

  const marcaActual = useMemo(
    () => marcas.find(m => m.id === (marcaId || marcas[0]?.id)),
    [marcas, marcaId]
  )

  const selectedId = marcaId || marcas[0]?.id || ""

  const { data, isLoading, error } = useQuery({
    queryKey: ["marca_demanda", selectedId],
    queryFn: () => fetchMarcaDemanda(selectedId),
    enabled: !!selectedId,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedId} onValueChange={setMarcaId} disabled={loadingMarcas}>
          <SelectTrigger className="w-64 h-9">
            <SelectValue placeholder="Selecciona una marca" />
          </SelectTrigger>
          <SelectContent>
            {marcas.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {marcaActual && (
          <span className="text-xs text-muted-foreground">
            Demanda y compra agregada de todos los SKUs de {marcaActual.nombre}
          </span>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        {isLoading || loadingMarcas ? (
          <div className="h-56 animate-pulse rounded-lg bg-muted" />
        ) : error || !data ? (
          <p className="text-sm text-muted-foreground">Sin datos de ventas para esta marca.</p>
        ) : (
          <DemandaCompraViz
            data={data}
            title={`Demanda y curva de compra — ${marcaActual?.nombre ?? ""} (6 meses)`}
          />
        )}
      </div>
    </div>
  )
}
