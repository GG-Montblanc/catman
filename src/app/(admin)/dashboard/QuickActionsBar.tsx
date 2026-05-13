"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Sparkles,
  LayoutGrid,
  ShoppingCart,
  TrendingUp,
  BookOpen,
  ArrowRight,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type ActionTile = {
  label: string
  desc: string
  href: string
  icon: React.ElementType
  baseColor: string
  urgentColor?: string
  isUrgent?: boolean
  badge?: string | number
}

export function QuickActionsBar() {
  const sb = createClient()

  // Fetch alertas alta prioridad count
  const { data: alertaCount } = useQuery({
    queryKey: ["quick_alertas_count"],
    queryFn: async () => {
      const { data } = await (sb.rpc as any)("get_alertas_dashboard", { p_limit: 100 })
      const alta = (data ?? []).filter((a: any) => a.severidad === 1).length
      const total = (data ?? []).length
      return { alta, total }
    },
    staleTime: 3 * 60 * 1000,
  })

  // Fetch planogramas count
  const { data: planoCount } = useQuery({
    queryKey: ["quick_planogramas_count"],
    queryFn: async () => {
      const { count } = await (sb as any)
        .from("planogramas")
        .select("id", { count: "exact", head: true })
      return count ?? 0
    },
    staleTime: 10 * 60 * 1000,
  })

  const altaAlerts = alertaCount?.alta ?? 0
  const totalAlerts = alertaCount?.total ?? 0

  const tiles: ActionTile[] = [
    {
      label: "Alertas",
      desc: altaAlerts > 0
        ? `${altaAlerts} de alta prioridad`
        : totalAlerts > 0
        ? `${totalAlerts} activa${totalAlerts !== 1 ? "s" : ""}`
        : "Sin alertas críticas",
      href: "/alertas",
      icon: AlertTriangle,
      baseColor: "border-muted-foreground/20 hover:border-amber-300",
      urgentColor: "border-rose-400 bg-rose-50 hover:border-rose-500",
      isUrgent: altaAlerts > 0,
      badge: altaAlerts > 0 ? altaAlerts : undefined,
    },
    {
      label: "Optimización",
      desc: "Matriz GMROI × Sellthru",
      href: "/optimizacion",
      icon: Sparkles,
      baseColor: "border-muted-foreground/20 hover:border-violet-300",
    },
    {
      label: "Planogramas",
      desc: planoCount != null ? `${planoCount} planograma${planoCount !== 1 ? "s" : ""}` : "Ver estantes",
      href: "/planogramas",
      icon: LayoutGrid,
      baseColor: "border-muted-foreground/20 hover:border-pink-300",
    },
    {
      label: "Compras sugeridas",
      desc: "Órdenes de reposición",
      href: "/optimizacion?tab=compras",
      icon: ShoppingCart,
      baseColor: "border-muted-foreground/20 hover:border-teal-300",
    },
    {
      label: "Tendencias",
      desc: "Atributos en alza/baja",
      href: "/tendencias",
      icon: TrendingUp,
      baseColor: "border-muted-foreground/20 hover:border-green-300",
    },
    {
      label: "Manual",
      desc: "Diccionario de indicadores",
      href: "/manual",
      icon: BookOpen,
      baseColor: "border-muted-foreground/20 hover:border-blue-300",
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {tiles.map(tile => {
        const Icon = tile.icon
        const isUrgent = tile.isUrgent ?? false

        return (
          <Link
            key={tile.href}
            href={tile.href}
            className={cn(
              "group relative flex flex-col gap-2 rounded-xl border bg-card px-4 py-3.5 transition-all hover:shadow-sm",
              isUrgent ? tile.urgentColor : tile.baseColor
            )}
          >
            <div className="flex items-start justify-between">
              <Icon className={cn(
                "h-4.5 w-4.5 transition-colors",
                isUrgent ? "text-rose-500" : "text-muted-foreground group-hover:text-foreground"
              )} style={{ height: "1.125rem", width: "1.125rem" }} />

              {tile.badge != null && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold px-1">
                  {tile.badge}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <p className={cn(
                "text-sm font-semibold leading-tight",
                isUrgent && "text-rose-700"
              )}>
                {tile.label}
              </p>
              <p className={cn(
                "text-xs mt-0.5 leading-tight",
                isUrgent ? "text-rose-600" : "text-muted-foreground"
              )}>
                {tile.desc}
              </p>
            </div>

            <ArrowRight className={cn(
              "h-3.5 w-3.5 absolute bottom-3.5 right-3.5 opacity-0 group-hover:opacity-100 transition-opacity",
              isUrgent ? "text-rose-500" : "text-muted-foreground"
            )} />
          </Link>
        )
      })}
    </div>
  )
}
