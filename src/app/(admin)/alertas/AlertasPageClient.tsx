"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import Papa from "papaparse"
import {
  AlertTriangle,
  TrendingDown,
  Package,
  ShieldAlert,
  Download,
  Search,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AlertaRow } from "./page"

// ─── Config ───────────────────────────────────────────────────────────────────

const TIPO_CONFIG = {
  dog: {
    label:     "Dog",
    color:     "text-rose-600",
    badge:     "bg-rose-100 text-rose-800",
    border:    "border-l-rose-500",
    icon:      TrendingDown,
    emoji:     "🐕",
    desc:      "GMROI bajo y rotación lenta — candidato a liquidación",
  },
  sobrestock: {
    label:     "Sobrestock",
    color:     "text-orange-600",
    badge:     "bg-orange-100 text-orange-800",
    border:    "border-l-orange-400",
    icon:      Package,
    emoji:     "📦",
    desc:      "Inventario elevado — revisar próxima compra",
  },
  quiebre_riesgo: {
    label:     "Quiebre",
    color:     "text-amber-600",
    badge:     "bg-amber-100 text-amber-800",
    border:    "border-l-amber-400",
    icon:      ShieldAlert,
    emoji:     "⚠️",
    desc:      "Stock escaso — riesgo de quiebre inminente",
  },
  obsoleto: {
    label:     "Obsoleto",
    color:     "text-yellow-700",
    badge:     "bg-yellow-100 text-yellow-800",
    border:    "border-l-yellow-400",
    icon:      AlertTriangle,
    emoji:     "🟡",
    desc:      "Inventario obsoleto — evaluar promoción",
  },
} as const

const SEV_LABEL: Record<number, string> = { 1: "Alta", 2: "Media", 3: "Baja" }
const SEV_BADGE: Record<number, string> = {
  1: "bg-rose-100 text-rose-800",
  2: "bg-amber-100 text-amber-800",
  3: "bg-slate-100 text-slate-700",
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  tipo,
  count,
  active,
  onClick,
}: {
  tipo: keyof typeof TIPO_CONFIG
  count: number
  active: boolean
  onClick: () => void
}) {
  const cfg = TIPO_CONFIG[tipo]
  const Icon = cfg.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-all hover:shadow-sm flex flex-col gap-2",
        active
          ? "border-[oklch(0.62_0.20_358)] bg-[oklch(0.97_0.01_358)] shadow-sm"
          : "bg-card hover:border-muted-foreground/30"
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className={cn("h-4 w-4", cfg.color)} />
        {active && (
          <span className="text-[10px] font-semibold text-[var(--brand-magenta)]">
            FILTRADO
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{count}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {cfg.emoji} {cfg.label}
        </p>
      </div>
    </button>
  )
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({ alerta }: { alerta: AlertaRow }) {
  const cfg = TIPO_CONFIG[alerta.tipo_alerta] ?? TIPO_CONFIG.obsoleto
  const Icon = cfg.icon

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border border-l-4 bg-card px-4 py-3",
        cfg.border
      )}
    >
      {/* Imagen */}
      <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-muted border">
        {alerta.imagen_url ? (
          <Image
            src={alerta.imagen_url}
            alt={alerta.sku_nombre}
            width={56}
            height={56}
            className="h-14 w-14 object-contain p-1"
            unoptimized
          />
        ) : (
          <div className="h-14 w-14 flex items-center justify-center text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold leading-tight truncate max-w-xs">
            {alerta.sku_nombre}
          </p>
          <Badge className={cn("text-xs shrink-0", cfg.badge)}>
            {cfg.emoji} {cfg.label}
          </Badge>
          <Badge className={cn("text-xs shrink-0", SEV_BADGE[alerta.severidad])}>
            Prioridad {SEV_LABEL[alerta.severidad]}
          </Badge>
        </div>
        {alerta.marca_nombre && (
          <p className="text-xs text-muted-foreground mt-0.5">{alerta.marca_nombre}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1 leading-snug">
          {alerta.descripcion}
        </p>
      </div>

      {/* KPIs */}
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right min-w-20">
        {alerta.valor_gmroi != null && (
          <div>
            <p className="text-[10px] text-muted-foreground">GMROI</p>
            <p
              className={cn(
                "text-sm font-bold tabular-nums",
                alerta.valor_gmroi < 1 ? "text-rose-600" : "text-amber-600"
              )}
            >
              {alerta.valor_gmroi.toFixed(2)}×
            </p>
          </div>
        )}
        {alerta.valor_mdi != null && (
          <div>
            <p className="text-[10px] text-muted-foreground">MDI</p>
            <p className="text-sm font-bold tabular-nums text-muted-foreground">
              {alerta.valor_mdi.toFixed(1)}m
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AlertasPageClient({ alertas }: { alertas: AlertaRow[] }) {
  const [search, setSearch]           = useState("")
  const [tipoFiltro, setTipoFiltro]   = useState<string>("all")
  const [sevFiltro, setSevFiltro]     = useState<string>("all")

  // ── Counts by tipo ────────────────────────────────────────────────────────
  const countByTipo = useMemo(() => {
    const c: Record<string, number> = { dog: 0, sobrestock: 0, quiebre_riesgo: 0, obsoleto: 0 }
    for (const a of alertas) c[a.tipo_alerta] = (c[a.tipo_alerta] ?? 0) + 1
    return c
  }, [alertas])

  const alta  = alertas.filter(a => a.severidad === 1).length
  const media = alertas.filter(a => a.severidad === 2).length

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return alertas.filter(a => {
      if (tipoFiltro !== "all" && a.tipo_alerta !== tipoFiltro) return false
      if (sevFiltro !== "all"  && String(a.severidad) !== sevFiltro) return false
      if (q && !a.sku_nombre.toLowerCase().includes(q) && !(a.marca_nombre ?? "").toLowerCase().includes(q)) return false
      return true
    })
  }, [alertas, tipoFiltro, sevFiltro, search])

  // ── Export ────────────────────────────────────────────────────────────────
  function exportCsv() {
    const csv = Papa.unparse(
      filtered.map(a => ({
        SKU:           a.sku_nombre,
        Marca:         a.marca_nombre ?? "",
        "Tipo alerta": TIPO_CONFIG[a.tipo_alerta]?.label ?? a.tipo_alerta,
        Severidad:     SEV_LABEL[a.severidad] ?? String(a.severidad),
        Descripción:   a.descripcion,
        GMROI:         a.valor_gmroi?.toFixed(2) ?? "",
        "MDI (meses)": a.valor_mdi?.toFixed(1) ?? "",
      }))
    )
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `alertas_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertas accionables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {alertas.length} alerta{alertas.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-rose-600 font-medium">{alta} alta prioridad</span>
            {media > 0 && (
              <> · <span className="text-amber-600 font-medium">{media} media prioridad</span></>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(TIPO_CONFIG) as (keyof typeof TIPO_CONFIG)[]).map(tipo => (
          <SummaryCard
            key={tipo}
            tipo={tipo}
            count={countByTipo[tipo] ?? 0}
            active={tipoFiltro === tipo}
            onClick={() => setTipoFiltro(tipoFiltro === tipo ? "all" : tipo)}
          />
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52 max-w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar SKU o marca…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-44 h-9 gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(
              ([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {cfg.emoji} {cfg.label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        <Select value={sevFiltro} onValueChange={setSevFiltro}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Severidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda severidad</SelectItem>
            <SelectItem value="1">🔴 Alta prioridad</SelectItem>
            <SelectItem value="2">🟡 Media prioridad</SelectItem>
            <SelectItem value="3">⚪ Baja prioridad</SelectItem>
          </SelectContent>
        </Select>

        {(tipoFiltro !== "all" || sevFiltro !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-9"
            onClick={() => { setTipoFiltro("all"); setSevFiltro("all"); setSearch("") }}
          >
            Limpiar filtros
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Alert list ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-16 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-semibold">
            {alertas.length === 0 ? "Sin alertas críticas" : "Sin resultados"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {alertas.length === 0
              ? "Todos los SKUs activos están dentro de rangos saludables"
              : "Intenta cambiar los filtros"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Alta prioridad */}
          {(() => {
            const alta = filtered.filter(a => a.severidad === 1)
            if (alta.length === 0) return null
            return (
              <div>
                <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-2">
                  🔴 Alta prioridad — {alta.length} alerta{alta.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-2">
                  {alta.map(a => <AlertRow key={a.sku_id + a.tipo_alerta} alerta={a} />)}
                </div>
              </div>
            )
          })()}

          {/* Media prioridad */}
          {(() => {
            const alta = filtered.filter(a => a.severidad === 1)
            const media = filtered.filter(a => a.severidad === 2)
            if (media.length === 0) return null
            return (
              <div className={alta.length > 0 ? "mt-5" : ""}>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                  🟡 Media prioridad — {media.length} alerta{media.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-2">
                  {media.map(a => <AlertRow key={a.sku_id + a.tipo_alerta} alerta={a} />)}
                </div>
              </div>
            )
          })()}

          {/* Baja prioridad */}
          {(() => {
            const baja = filtered.filter(a => a.severidad === 3)
            if (baja.length === 0) return null
            const prev = filtered.filter(a => a.severidad < 3).length
            return (
              <div className={prev > 0 ? "mt-5" : ""}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  ⚪ Baja prioridad — {baja.length} alerta{baja.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-2">
                  {baja.map(a => <AlertRow key={a.sku_id + a.tipo_alerta} alerta={a} />)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
