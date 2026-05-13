"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  TrendingDown,
  Package,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  ArrowRight,
} from "lucide-react"
import Image from "next/image"

type Alerta = {
  sku_id: string
  sku_nombre: string
  marca_nombre: string | null
  tipo_alerta: "dog" | "sobrestock" | "quiebre_riesgo" | "obsoleto"
  severidad: 1 | 2 | 3
  descripcion: string
  valor_gmroi: number | null
  valor_mdi: number | null
  imagen_url: string | null
}

const TIPO_CONFIG = {
  dog: {
    label:  "Dog",
    icon:   TrendingDown,
    badge:  "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    border: "border-l-rose-500",
  },
  sobrestock: {
    label:  "Sobrestock",
    icon:   Package,
    badge:  "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    border: "border-l-orange-400",
  },
  quiebre_riesgo: {
    label:  "Quiebre",
    icon:   ShieldAlert,
    badge:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    border: "border-l-amber-400",
  },
  obsoleto: {
    label:  "Obsoleto",
    icon:   AlertTriangle,
    badge:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    border: "border-l-yellow-400",
  },
}

export function AlertasPanel() {
  const [open, setOpen] = useState(true)
  const sb = createClient()

  const { data: alertas = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["alertas_dashboard"],
    queryFn: async () => {
      const { data, error } = await (sb.rpc as any)("get_alertas_dashboard", { p_limit: 20 })
      if (error) throw error
      return (data ?? []) as Alerta[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const alta   = alertas.filter(a => a.severidad === 1)
  const media  = alertas.filter(a => a.severidad === 2)
  const totalStr = alertas.length === 0 ? "Sin alertas" : `${alertas.length} alerta${alertas.length !== 1 ? "s" : ""}`

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className={cn(
            "h-4 w-4",
            alta.length > 0 ? "text-rose-500" : "text-amber-500"
          )} />
          <span className="font-semibold text-sm">Alertas accionables</span>
          {!isLoading && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              alta.length > 0
                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                : "bg-muted text-muted-foreground"
            )}>
              {totalStr}
            </span>
          )}
          {alta.length > 0 && (
            <span className="rounded-full bg-rose-500 text-white px-2 py-0.5 text-xs font-bold animate-pulse">
              {alta.length} alta prioridad
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Act. {updatedAt}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={e => { e.stopPropagation(); refetch() }}
            title="Actualizar alertas"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-4 pt-1 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : alertas.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-2xl mb-2">✅</div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Sin alertas críticas
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los SKUs activos están dentro de rangos saludables
              </p>
            </div>
          ) : (
            <>
              {/* Alta prioridad */}
              {alta.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-2">
                    Alta prioridad
                  </p>
                  <div className="space-y-2">
                    {alta.map(a => <AlertRow key={a.sku_id} alerta={a} />)}
                  </div>
                </div>
              )}

              {/* Media prioridad */}
              {media.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 mt-3">
                    Media prioridad
                  </p>
                  <div className="space-y-2">
                    {media.map(a => <AlertRow key={a.sku_id} alerta={a} />)}
                  </div>
                </div>
              )}

              {/* Ver todas link */}
              {alertas.length > 0 && (
                <div className="pt-1">
                  <Link
                    href="/alertas"
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-magenta)] hover:opacity-80 transition-opacity"
                  >
                    Ver las {alertas.length} alertas completas
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Map alert type to a primary action link
const ALERT_ACTION: Record<string, { label: string; href: string }> = {
  dog:            { label: "Ver en Cuadrantes", href: "/optimizacion" },
  sobrestock:     { label: "Ver SKUs MDI",      href: "/skus" },
  quiebre_riesgo: { label: "Ver pedidos",       href: "/optimizacion?tab=compras" },
  obsoleto:       { label: "Ver SKUs MDI",      href: "/skus" },
}

function AlertRow({ alerta }: { alerta: Alerta }) {
  const cfg    = TIPO_CONFIG[alerta.tipo_alerta] ?? TIPO_CONFIG.obsoleto
  const Icon   = cfg.icon
  const action = ALERT_ACTION[alerta.tipo_alerta]

  return (
    <div className={cn(
      "rounded-lg border border-l-4 bg-background",
      cfg.border,
    )}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Imagen */}
        <div className="h-10 w-10 flex-shrink-0 rounded overflow-hidden bg-muted">
          {alerta.imagen_url ? (
            <Image
              src={alerta.imagen_url}
              alt={alerta.sku_nombre}
              width={40} height={40}
              className="object-cover h-10 w-10"
              unoptimized
            />
          ) : (
            <div className="h-10 w-10 flex items-center justify-center text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium leading-tight truncate max-w-48">
              {alerta.sku_nombre}
            </p>
            <Badge className={cn("text-xs shrink-0", cfg.badge)}>
              {cfg.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1">
            {alerta.descripcion}
          </p>
        </div>

        {/* Métricas */}
        <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
          {alerta.valor_gmroi != null && (
            <span className="text-xs tabular-nums font-semibold">
              GMROI {alerta.valor_gmroi.toFixed(2)}×
            </span>
          )}
          {alerta.valor_mdi != null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              MDI {alerta.valor_mdi.toFixed(1)}m
            </span>
          )}
        </div>
      </div>

      {/* Action footer */}
      <div className="border-t flex items-center gap-2 px-3 py-1.5 bg-muted/20">
        <span className="text-[10px] text-muted-foreground flex-1 leading-tight hidden sm:block">
          {cfg.label === "Quiebre" ? "⚡ Acción urgente: reponer stock" :
           cfg.label === "Dog"     ? "💡 Evalúa reemplazar o liquidar" :
           cfg.label === "Sobrestock" ? "📦 Reducir próxima compra" :
           "🟡 Evaluar promoción agresiva"}
        </span>
        {action && (
          <Link
            href={action.href}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--brand-magenta)] hover:opacity-80 transition-opacity shrink-0"
          >
            {action.label}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        <Link
          href="/alertas"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
