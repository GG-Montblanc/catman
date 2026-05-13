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
import { createClient } from "@/lib/supabase/client"
import { AlertasPanel } from "@/components/charts/AlertasPanel"

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

  // Quick stats: conteos de entidades activas
  const sb = createClient()
  const { data: quickStats } = useQuery({
    queryKey: ["dashboard_quick_stats"],
    queryFn: async () => {
      const [skus, tiendas, categorias] = await Promise.all([
        sb.from("skus").select("id", { count: "exact", head: true }).eq("activo", true),
        sb.from("tiendas").select("id", { count: "exact", head: true }).eq("activa", true),
        sb.from("categorias").select("id", { count: "exact", head: true }),
      ])
      return {
        n_skus:       skus.count ?? 0,
        n_tiendas:    tiendas.count ?? 0,
        n_categorias: categorias.count ?? 0,
      }
    },
    staleTime: 10 * 60 * 1000,
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

  // Banner cuando no hay datos KPI (MV vacía)
  const noData = !loadingKpis && kpis != null &&
    kpis.avg_gmroi == null && kpis.total_ingreso == null

  return (
    <div className="space-y-6">
      {/* Banner sin datos */}
      {noData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-5 py-4 flex items-start gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Sin datos de KPIs — la vista materializada está vacía
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              Corre <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">npm run seed:fake</code> y
              luego <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">npm run seed:planogramas</code> para
              generar datos sintéticos. O haz clic en{" "}
              <strong>Refrescar KPIs</strong> si los datos ya están en la DB.
            </p>
          </div>
        </div>
      )}

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

      {/* Quick Stats bar */}
      <div className="flex flex-wrap gap-2">
        {[
          {
            label: "SKUs activos",
            value: quickStats ? quickStats.n_skus.toLocaleString("es-CL") : "…",
            icon: "📦",
          },
          {
            label: "Tiendas activas",
            value: quickStats ? quickStats.n_tiendas.toLocaleString("es-CL") : "…",
            icon: "🏬",
          },
          {
            label: "Categorías",
            value: quickStats ? quickStats.n_categorias.toLocaleString("es-CL") : "…",
            icon: "🏷️",
          },
          {
            label: "Período",
            value: periodo,
            icon: "📅",
          },
        ].map(pill => (
          <div
            key={pill.label}
            className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs"
          >
            <span>{pill.icon}</span>
            <span className="text-muted-foreground">{pill.label}</span>
            <span className="font-semibold tabular-nums">{pill.value}</span>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <AlertasPanel />

      {/* Charts */}
      <Tabs defaultValue="ejecutivo">
        <TabsList className="mb-4">
          <TabsTrigger value="ejecutivo">📊 Ejecutivo</TabsTrigger>
          <TabsTrigger value="tendencia">Tendencia 24m</TabsTrigger>
          <TabsTrigger value="top">Top 10 SKUs</TabsTrigger>
          <TabsTrigger value="bottom">Bottom 10 SKUs</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap Categoría × Tienda</TabsTrigger>
        </TabsList>

        {/* ── Resumen Ejecutivo ──────────────────────────────────────── */}
        <TabsContent value="ejecutivo">
          <div className="space-y-4">
            {/* Big 4 KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: "Ingreso Total",
                  value: kpis ? fmtCLP(kpis.total_ingreso) : "—",
                  sub: "en el período",
                  color: "text-foreground",
                  bg: "bg-card",
                },
                {
                  label: "Margen Total",
                  value: kpis ? fmtCLP(kpis.total_margen) : "—",
                  sub: kpis?.avg_margen_pct != null ? `${kpis.avg_margen_pct.toFixed(1)}% sobre ventas` : "—",
                  color: "text-emerald-600",
                  bg: "bg-emerald-50/60",
                },
                {
                  label: "GMROI Promedio",
                  value: kpis?.avg_gmroi != null ? `${kpis.avg_gmroi.toFixed(2)}×` : "—",
                  sub: kpis?.avg_gmroi != null
                    ? kpis.avg_gmroi >= 2 ? "✅ Excelente" : kpis.avg_gmroi >= 1 ? "⚠️ Moderado" : "🔴 Bajo"
                    : "—",
                  color: kpis?.avg_gmroi != null
                    ? kpis.avg_gmroi >= 2 ? "text-emerald-600" : kpis.avg_gmroi >= 1 ? "text-amber-600" : "text-rose-600"
                    : "text-muted-foreground",
                  bg: "bg-card",
                },
                {
                  label: "Sellthru",
                  value: kpis?.avg_sellthru_pct != null ? `${kpis.avg_sellthru_pct.toFixed(1)}%` : "—",
                  sub: kpis?.avg_sellthru_pct != null
                    ? kpis.avg_sellthru_pct >= 65 ? "✅ Saludable" : kpis.avg_sellthru_pct >= 40 ? "⚠️ Mejorable" : "🔴 Crítico"
                    : "—",
                  color: kpis?.avg_sellthru_pct != null
                    ? kpis.avg_sellthru_pct >= 65 ? "text-emerald-600" : kpis.avg_sellthru_pct >= 40 ? "text-amber-600" : "text-rose-600"
                    : "text-muted-foreground",
                  bg: "bg-card",
                },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                  <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold tabular-nums leading-none ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Health indicators + Top performers */}
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Indicadores */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">Indicadores clave</h3>
                <div className="space-y-2">
                  {[
                    {
                      label: "Fill Rate",
                      value: kpis?.avg_fill_rate != null ? `${kpis.avg_fill_rate.toFixed(1)}%` : "—",
                      ok: kpis?.avg_fill_rate != null && kpis.avg_fill_rate >= 85,
                      warn: kpis?.avg_fill_rate != null && kpis.avg_fill_rate >= 70,
                    },
                    {
                      label: "Días de stock promedio",
                      value: kpis?.avg_dias_stock != null ? `${kpis.avg_dias_stock.toFixed(0)} días` : "—",
                      ok: kpis?.avg_dias_stock != null && kpis.avg_dias_stock <= 70,
                      warn: kpis?.avg_dias_stock != null && kpis.avg_dias_stock <= 120,
                    },
                    {
                      label: "SKUs obsoletos (MDI > 6m)",
                      value: kpis?.pct_obsoletos != null ? `${kpis.pct_obsoletos.toFixed(1)}%` : "—",
                      ok: kpis?.pct_obsoletos != null && kpis.pct_obsoletos <= 10,
                      warn: kpis?.pct_obsoletos != null && kpis.pct_obsoletos <= 25,
                    },
                    {
                      label: "Sell-to-Stock",
                      value: kpis?.avg_sell_to_stock != null ? `${(kpis.avg_sell_to_stock * 100).toFixed(1)}%` : "—",
                      ok: kpis?.avg_sell_to_stock != null && kpis.avg_sell_to_stock * 100 >= 30,
                      warn: kpis?.avg_sell_to_stock != null && kpis.avg_sell_to_stock * 100 >= 15,
                    },
                    {
                      label: "SKUs activos",
                      value: quickStats?.n_skus != null ? `${quickStats.n_skus.toLocaleString("es-CL")}` : "…",
                      ok: true,
                      warn: true,
                    },
                    {
                      label: "Tiendas activas",
                      value: quickStats?.n_tiendas != null ? `${quickStats.n_tiendas}` : "…",
                      ok: true,
                      warn: true,
                    },
                  ].map(ind => {
                    const dot = ind.ok
                      ? "bg-emerald-500"
                      : ind.warn
                      ? "bg-amber-500"
                      : "bg-rose-500"
                    return (
                      <div key={ind.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
                          <span className="text-muted-foreground">{ind.label}</span>
                        </div>
                        <span className="font-semibold tabular-nums">{ind.value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Top performers */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">Top 5 SKUs por GMROI</h3>
                {loadingTopBottom ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(topBottom?.top ?? []).slice(0, 5).map((sku, i) => (
                      <div key={sku.sku_id} className="flex items-center gap-2 text-sm">
                        <span className="w-4 text-xs text-muted-foreground font-mono">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium text-xs leading-tight">{sku.nombre}</p>
                          <p className="text-[10px] text-muted-foreground">{sku.marca_nombre}</p>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 tabular-nums shrink-0">
                          {sku.avg_gmroi != null ? `${sku.avg_gmroi.toFixed(2)}×` : "—"}
                        </span>
                      </div>
                    ))}
                    {(topBottom?.top ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Sin datos</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Critical SKUs */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-rose-600">⚠️ SKUs críticos — Bottom 5 GMROI</h3>
              {loadingTopBottom ? (
                <div className="h-20 animate-pulse rounded bg-muted" />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {(topBottom?.bottom ?? []).slice(0, 5).map(sku => (
                    <div key={sku.sku_id} className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 space-y-1">
                      <p className="text-xs font-medium leading-tight line-clamp-2">{sku.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{sku.marca_nombre}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs font-bold text-rose-600 tabular-nums">
                          {sku.avg_gmroi != null ? `${sku.avg_gmroi.toFixed(2)}×` : "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">GMROI</span>
                      </div>
                    </div>
                  ))}
                  {(topBottom?.bottom ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground italic col-span-5">Sin datos</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

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
