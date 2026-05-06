"use client"

import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { subMonths, startOfMonth, format } from "date-fns"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KpiCard } from "@/components/charts/KpiCard"
import { KpiTrendLine } from "@/components/charts/KpiTrendLine"
import { TopBottomBars } from "@/components/charts/TopBottomBars"
import { CategoriaTiendaHeatmap } from "@/components/charts/CategoriaTiendaHeatmap"
import {
  fetchGlobalKpis,
  fetchTendencia,
  fetchTopBottomSkus,
  fetchHeatmap,
} from "@/lib/kpi/queries"
import { gmroiColor, sellthruColor, type DashboardFilters } from "@/lib/kpi/types"

function periodToRange(periodo: string) {
  const months = periodo === "3m" ? 3 : periodo === "6m" ? 6 : periodo === "24m" ? 24 : 12
  const hasta  = format(new Date(), "yyyy-MM-dd")
  const desde  = format(startOfMonth(subMonths(new Date(), months)), "yyyy-MM-dd")
  return { desde, hasta }
}

function fmtCLP(v: number | null) {
  if (v == null) return "—"
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export function DashboardClient() {
  const params  = useSearchParams()
  const periodo = params.get("periodo") ?? "12m"
  const { desde, hasta } = periodToRange(periodo)

  const filters: DashboardFilters = {
    desde,
    hasta,
    tienda:    params.get("tienda")   ?? undefined,
    canal:     params.get("canal")    ?? undefined,
    region:    params.get("region")   ?? undefined,
    formato:   params.get("formato")  ?? undefined,
    categoria: params.get("categoria") ?? undefined,
    marca:     params.get("marca")    ?? undefined,
  }

  const filtersKey = JSON.stringify(filters)

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ["dashboard_kpis", filtersKey],
    queryFn:  () => fetchGlobalKpis(filters),
    staleTime: 5 * 60 * 1000,
  })

  const { data: tendencia = [], isLoading: loadingTrend } = useQuery({
    queryKey: ["dashboard_tendencia", filtersKey],
    queryFn:  () => fetchTendencia({ ...filters, desde: periodToRange("24m").desde }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: topBottom, isLoading: loadingTopBottom } = useQuery({
    queryKey: ["dashboard_topbottom", filtersKey],
    queryFn:  () => fetchTopBottomSkus(filters, 10),
    staleTime: 5 * 60 * 1000,
  })

  const { data: heatmapData = [], isLoading: loadingHeatmap } = useQuery({
    queryKey: ["dashboard_heatmap", desde, hasta],
    queryFn:  () => fetchHeatmap(desde, hasta),
    staleTime: 10 * 60 * 1000,
  })

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          title="GMROI"
          value={kpis?.avg_gmroi ?? null}
          unit="x"
          color={gmroiColor(kpis?.avg_gmroi ?? null)}
          description="retorno promedio"
          loading={loadingKpis}
        />
        <KpiCard
          title="Sellthru"
          value={kpis?.avg_sellthru_pct ?? null}
          unit="%"
          color={sellthruColor(kpis?.avg_sellthru_pct ?? null)}
          loading={loadingKpis}
        />
        <KpiCard
          title="Sell-to-Stock"
          value={kpis?.avg_sell_to_stock != null
            ? Number((kpis.avg_sell_to_stock * 100).toFixed(1))
            : null}
          unit="%"
          loading={loadingKpis}
        />
        <KpiCard
          title="Margen"
          value={kpis?.avg_margen_pct ?? null}
          unit="%"
          color={
            (kpis?.avg_margen_pct ?? null) != null
              ? kpis!.avg_margen_pct! >= 35 ? "green" : kpis!.avg_margen_pct! >= 20 ? "yellow" : "red"
              : "gray"
          }
          loading={loadingKpis}
        />
        <KpiCard
          title="Días de Stock"
          value={kpis?.avg_dias_stock ?? null}
          unit="días"
          color={
            (kpis?.avg_dias_stock ?? null) != null
              ? kpis!.avg_dias_stock! <= 70 ? "green" : kpis!.avg_dias_stock! <= 120 ? "yellow" : "red"
              : "gray"
          }
          trendInvert
          loading={loadingKpis}
        />
        <KpiCard
          title="Fill Rate"
          value={kpis?.avg_fill_rate ?? null}
          unit="%"
          color={
            (kpis?.avg_fill_rate ?? null) != null
              ? kpis!.avg_fill_rate! >= 90 ? "green" : kpis!.avg_fill_rate! >= 70 ? "yellow" : "red"
              : "gray"
          }
          loading={loadingKpis}
        />
        <KpiCard
          title="% Obsoletos"
          value={kpis?.pct_obsoletos ?? null}
          unit="%"
          color={
            (kpis?.pct_obsoletos ?? null) != null
              ? kpis!.pct_obsoletos! <= 10 ? "green" : kpis!.pct_obsoletos! <= 25 ? "yellow" : "red"
              : "gray"
          }
          description="MDI > 6 meses"
          trendInvert
          loading={loadingKpis}
        />
      </div>

      {/* Revenue summary */}
      {kpis && (
        <div className="flex gap-6 rounded-xl border bg-card px-5 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">Ingreso total</span>{" "}
            <span className="font-bold tabular-nums">{fmtCLP(kpis.total_ingreso)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Margen total</span>{" "}
            <span className="font-bold tabular-nums text-emerald-600">{fmtCLP(kpis.total_margen)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Unidades</span>{" "}
            <span className="font-bold tabular-nums">
              {kpis.total_unidades?.toLocaleString("es-CL") ?? "—"}
            </span>
          </div>
        </div>
      )}

      {/* Charts */}
      <Tabs defaultValue="tendencia">
        <TabsList className="mb-4">
          <TabsTrigger value="tendencia">Tendencia 24m</TabsTrigger>
          <TabsTrigger value="top">Top 10 SKUs</TabsTrigger>
          <TabsTrigger value="bottom">Bottom 10 SKUs</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap Categoría × Tienda</TabsTrigger>
        </TabsList>

        <TabsContent value="tendencia">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Evolución de KPIs (24 meses)</h3>
            {loadingTrend
              ? <div className="h-64 animate-pulse rounded-lg bg-muted" />
              : <KpiTrendLine data={tendencia} activeMetrics={["avg_gmroi", "avg_sellthru", "avg_margen_pct"]} />
            }
          </div>
        </TabsContent>

        <TabsContent value="top">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">Top 10 SKUs por GMROI</h3>
            <p className="text-xs text-muted-foreground mb-4">
              SKUs con mayor retorno sobre el inventario invertido
            </p>
            {loadingTopBottom
              ? <div className="h-64 animate-pulse rounded-lg bg-muted" />
              : <TopBottomBars data={topBottom?.top ?? []} mode="top" />
            }
          </div>
        </TabsContent>

        <TabsContent value="bottom">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">Bottom 10 SKUs por GMROI</h3>
            <p className="text-xs text-muted-foreground mb-4">
              SKUs críticos que consumen capital sin retorno adecuado
            </p>
            {loadingTopBottom
              ? <div className="h-64 animate-pulse rounded-lg bg-muted" />
              : <TopBottomBars data={topBottom?.bottom ?? []} mode="bottom" />
            }
          </div>
        </TabsContent>

        <TabsContent value="heatmap">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">GMROI por Categoría × Tienda</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Identifica combinaciones de categoría y tienda con bajo rendimiento
            </p>
            {loadingHeatmap
              ? <div className="h-64 animate-pulse rounded-lg bg-muted" />
              : <CategoriaTiendaHeatmap data={heatmapData} />
            }
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
