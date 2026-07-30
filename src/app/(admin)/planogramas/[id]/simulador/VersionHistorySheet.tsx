"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { History, Clock, RefreshCw, ChevronRight, ArrowLeftRight, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { guardarCambios } from "./actions"
import type { PlanogramSlot } from "@/lib/planogram/types"

type SwapDetail = {
  bandeja:  number
  posicion: number
  orig_sku: { id: string; nombre: string }
  new_sku:  { id: string; nombre: string }
}

type SlotSnapshot = {
  slot_id:    string
  bandeja:    number
  posicion:   number
  sku_id:     string
  sku_nombre: string
  frente:     number
}

type VersionSnapshot = {
  v?:          number          // 2 = new format with enriched data
  slot_count?: number
  slots?:      SlotSnapshot[]
  swaps?:      SwapDetail[]
}

type Version = {
  id:            string
  planograma_id: string
  version:       number
  comentario:    string | null
  creado_at:     string
  snapshot:      VersionSnapshot | SlotSnapshot[] | null  // v1 is array, v2 is object
  creado_por:    string | null
  usuarios:      { nombre: string } | null  // embed via FK creado_por -> usuarios.id
}

type Props = {
  planogramaId: string
  currentSlots?: PlanogramSlot[]
  puedeEditar?: boolean
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const min  = Math.floor(diff / 60_000)
  const hr   = Math.floor(diff / 3_600_000)
  const day  = Math.floor(diff / 86_400_000)
  if (min < 1)   return "hace un momento"
  if (min < 60)  return `hace ${min} min`
  if (hr  < 24)  return `hace ${hr}h`
  if (day < 30)  return `hace ${day}d`
  return new Date(isoDate).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
}

function fmtDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-CL", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  })
}

function parseSnapshot(v: Version): { swaps: SwapDetail[]; slotCount: number; slots: SlotSnapshot[] } {
  const snap = v.snapshot
  if (!snap) return { swaps: [], slotCount: 0, slots: [] }

  // v2 format: { v: 2, slots: [...], swaps: [...], slot_count: N }
  if (!Array.isArray(snap) && typeof snap === "object" && "v" in snap && snap.v === 2) {
    return {
      swaps:      snap.swaps      ?? [],
      slotCount:  snap.slot_count ?? snap.slots?.length ?? 0,
      slots:      snap.slots      ?? [],
    }
  }

  // v1 format: array of slot snapshots (no swap details)
  const slots = Array.isArray(snap) ? snap : (snap as VersionSnapshot).slots ?? []
  return { swaps: [], slotCount: slots.length, slots }
}

export function VersionHistorySheet({ planogramaId, currentSlots, puedeEditar = true }: Props) {
  const router = useRouter()
  const [open, setOpen]             = useState(false)
  const [versions, setVersions]     = useState<Version[]>([])
  const [loading, setLoading]       = useState(false)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [restoring, setRestoring]   = useState<string | null>(null)

  async function handleRestore(v: Version) {
    if (!currentSlots) return
    const { slots: targetSlots } = parseSnapshot(v)
    if (targetSlots.length === 0) {
      toast.error("Esta versión no tiene un snapshot completo de slots para restaurar")
      return
    }

    const currentByKey = new Map(
      currentSlots.map(s => [`${s.bandeja}-${s.posicion}`, s])
    )
    const swaps: { slot_id: string; nuevo_sku_id: string }[] = []
    for (const target of targetSlots) {
      const key = `${target.bandeja}-${target.posicion}`
      const current = currentByKey.get(key)
      if (current && current.sku.id !== target.sku_id) {
        swaps.push({ slot_id: current.id, nuevo_sku_id: target.sku_id })
      }
    }

    if (swaps.length === 0) {
      toast.info("El planograma actual ya coincide con esta versión")
      setConfirmingId(null)
      return
    }

    setRestoring(v.id)
    const res = await guardarCambios(planogramaId, swaps, `Restaurado desde v${v.version}`)
    setRestoring(null)
    setConfirmingId(null)
    if (res.ok) {
      toast.success(`Restaurado a v${v.version} — guardado como v${res.version}`)
      setOpen(false)
      router.refresh()
    } else {
      toast.error(`Error al restaurar: ${res.error}`)
    }
  }

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from("planograma_versiones")
      .select("id, planograma_id, version, comentario, creado_at, snapshot, creado_por, usuarios(nombre)")
      .eq("planograma_id", planogramaId)
      .order("version", { ascending: false })
      .limit(20)
    setVersions((data ?? []) as unknown as Version[])
    setLoading(false)
  }, [planogramaId])

  useEffect(() => {
    if (open) fetchVersions()
  }, [open, fetchVersions])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <History className="h-3.5 w-3.5" />
          Historial
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--brand-magenta)]" />
              Historial de versiones
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchVersions}
              disabled={loading}
              title="Refrescar"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {versions.length > 0
              ? `${versions.length} versión${versions.length !== 1 ? "es" : ""} guardada${versions.length !== 1 ? "s" : ""}`
              : "Sin versiones aún"
            }
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && versions.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/20" />
              <div>
                <p className="text-sm font-medium">Sin versiones guardadas</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Las versiones se crean automáticamente al aplicar cambios desde el panel de escenario
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[28px] top-0 bottom-0 w-px bg-border" />

              {versions.map((v, idx) => {
                const isExpanded = expanded === v.id
                const isLatest   = idx === 0
                const { swaps, slotCount } = parseSnapshot(v)

                return (
                  <div key={v.id} className="relative px-5 py-4">
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute left-[22px] top-[22px] h-[13px] w-[13px] rounded-full border-2 bg-background z-10",
                      isLatest
                        ? "border-[var(--brand-magenta)] bg-[var(--brand-magenta)]"
                        : "border-muted-foreground/40"
                    )} />

                    <div className={cn(
                      "ml-8 rounded-xl border bg-card p-3.5 transition-all",
                      isExpanded && "shadow-sm"
                    )}>
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">v{v.version}</span>
                            {isLatest && (
                              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                                style={{
                                  background: "oklch(0.97 0.02 358)",
                                  color: "var(--brand-magenta)",
                                  border: "1px solid oklch(0.88 0.06 358)",
                                }}>
                                Actual
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {fmtDate(v.creado_at)} · {timeAgo(v.creado_at)}
                            {v.usuarios?.nombre && <> · por <span className="font-medium text-foreground/70">{v.usuarios.nombre}</span></>}
                          </p>

                          {v.comentario && (
                            <p className="text-xs text-foreground/75 mt-1.5 italic leading-snug">
                              "{v.comentario}"
                            </p>
                          )}
                        </div>

                        {/* Expand toggle */}
                        <button
                          className={cn(
                            "rounded-md p-1 hover:bg-muted transition-colors shrink-0 mt-0.5",
                            isExpanded && "bg-muted"
                          )}
                          onClick={() => setExpanded(isExpanded ? null : v.id)}
                        >
                          <ChevronRight className={cn(
                            "h-3.5 w-3.5 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90"
                          )} />
                        </button>
                      </div>

                      {/* Stats row */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {swaps.length > 0 && (
                          <div className="flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
                            style={{ background: "oklch(0.97 0.02 358)", color: "var(--brand-magenta)" }}>
                            <ArrowLeftRight className="h-2.5 w-2.5" />
                            {swaps.length} swap{swaps.length !== 1 ? "s" : ""}
                          </div>
                        )}
                        {slotCount > 0 && (
                          <div className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                            {slotCount} SKUs en estante
                          </div>
                        )}
                      </div>

                      {/* Restaurar esta versión */}
                      {!isLatest && puedeEditar && currentSlots && (
                        <div className="mt-2.5">
                          {confirmingId === v.id ? (
                            <div className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px]">
                              <span className="text-amber-800">¿Restaurar a v{v.version}?</span>
                              <Button
                                size="sm" variant="destructive"
                                className="h-6 px-2 text-[11px]"
                                disabled={restoring === v.id}
                                onClick={() => handleRestore(v)}
                              >
                                {restoring === v.id ? "Restaurando…" : "Sí, restaurar"}
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setConfirmingId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              className="h-6 gap-1 px-2 text-[11px]"
                              onClick={() => setConfirmingId(v.id)}
                            >
                              <Undo2 className="h-3 w-3" />
                              Restaurar esta versión
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Expanded: swap details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t">
                          {swaps.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Cambios aplicados
                              </p>
                              {swaps.map((sw, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs">
                                  <div className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground shrink-0 mt-0.5">
                                    B{sw.bandeja}·P{sw.posicion}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-muted-foreground line-through truncate leading-tight">
                                      {sw.orig_sku.nombre}
                                    </p>
                                    <p className="text-emerald-700 font-medium truncate leading-tight mt-0.5">
                                      → {sw.new_sku.nombre}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              {slotCount > 0
                                ? "Snapshot inicial — sin detalle de swaps"
                                : "Sin datos de slots"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-3 shrink-0 bg-muted/10">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Se muestran hasta las últimas 20 versiones. Las versiones se crean al aplicar cambios desde el panel de escenario.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
