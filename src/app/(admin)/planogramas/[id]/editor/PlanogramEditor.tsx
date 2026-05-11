"use client"

import { useState, useTransition, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { PlanogramData, PlanogramSku } from "@/lib/planogram/types"
import { guardarCambios } from "../simulador/actions"
import { CheckCircle, Loader2, BarChart2, Eye } from "lucide-react"
import { toast } from "sonner"

// ─── Types ─────────────────────────────────────────────────────────────────────
type SkuInfo = PlanogramSku & { avg_gmroi?: number | null; avg_sellthru?: number | null; avg_margen_pct?: number | null }
type SlotState = Map<string, SkuInfo>   // key = "bandeja-posicion"

function slotKey(bandeja: number, posicion: number) { return `${bandeja}-${posicion}` }
const SLOT_PREFIX = "slot:"
const POOL_PREFIX = "pool:"

// ─── Colors ────────────────────────────────────────────────────────────────────
function gmroiBg(v: number | null | undefined): string {
  if (v == null) return "hsl(var(--muted))"
  if (v >= 2.0)  return "oklch(0.55 0.17 142)"  // deep green
  if (v >= 1.0)  return "oklch(0.70 0.15 100)"  // yellow-green
  if (v >= 0.5)  return "oklch(0.72 0.14 60)"   // amber
  return                "oklch(0.58 0.18 20)"    // red
}
function gmroiColor(v: number | null | undefined): string {
  return v == null ? "hsl(var(--muted-foreground))" : "#fff"
}

// ─── Mini SKU card (inside shelf cell) ─────────────────────────────────────────
function SkuCard({ sku, compact = false }: { sku: SkuInfo; compact?: boolean }) {
  const g = sku.avg_gmroi
  return (
    <div className={cn("flex flex-col items-center gap-0.5 w-full h-full", compact ? "p-0.5" : "p-1.5")}>
      {sku.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sku.imagen_url}
          alt={sku.nombre}
          className="w-9 h-9 object-contain rounded shrink-0"
          draggable={false}
        />
      ) : (
        <div className="w-9 h-9 rounded bg-muted/60 flex items-center justify-center shrink-0">
          <span className="text-[8px] text-muted-foreground">SKU</span>
        </div>
      )}
      <p className="text-[8.5px] leading-tight text-center line-clamp-2 w-full font-medium">
        {sku.nombre}
      </p>
      <span
        className="text-[8px] font-bold rounded px-1.5 py-0.5 tabular-nums"
        style={{ background: gmroiBg(g), color: gmroiColor(g) }}
      >
        {g != null ? g.toFixed(2) : "—"}×
      </span>
    </div>
  )
}

// ─── Draggable wrapper ─────────────────────────────────────────────────────────
function DraggableSku({ draggableId, sku, compact }: { draggableId: string; sku: SkuInfo; compact?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: draggableId, data: { sku } })
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className="cursor-grab active:cursor-grabbing w-full h-full"
      style={{ opacity: isDragging ? 0.25 : 1, transition: "opacity 0.1s" }}
    >
      <SkuCard sku={sku} compact={compact} />
    </div>
  )
}

// ─── Droppable shelf cell ───────────────────────────────────────────────────────
function ShelfCell({ bandeja, posicion, sku, isEyeLevel }: {
  bandeja: number; posicion: number; sku: SkuInfo | undefined; isEyeLevel: boolean
}) {
  const id = slotKey(bandeja, posicion)
  const { setNodeRef, isOver } = useDroppable({ id: SLOT_PREFIX + id })

  const gmroiColor = sku?.avg_gmroi != null
    ? sku.avg_gmroi >= 2.0 ? "border-emerald-400/60"
    : sku.avg_gmroi >= 1.0 ? "border-amber-300/60"
    : "border-rose-400/60"
    : ""

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border rounded transition-all flex items-center justify-center",
        isOver && "bg-[oklch(0.62_0.20_358/0.1)] border-[var(--brand-magenta)]",
        !isOver && sku && gmroiColor,
        !isOver && !sku && "border-dashed border-border/50",
      )}
      style={{
        width:       74,
        height:      90,
        borderLeft:  isEyeLevel ? "3px solid var(--brand-magenta)" : undefined,
        background:  isOver ? undefined : sku ? "var(--card)" : "oklch(0.97 0 0)",
      }}
    >
      {sku ? (
        <DraggableSku draggableId={SLOT_PREFIX + id} sku={sku} compact />
      ) : (
        <span className="text-[9px] text-muted-foreground/30 font-medium">{posicion}</span>
      )}
    </div>
  )
}

// ─── Shelf grid ────────────────────────────────────────────────────────────────
function ShelfGrid({ nBandejas, nPosiciones, slots, eyeLevelBandejas }: {
  nBandejas: number; nPosiciones: number; slots: SlotState; eyeLevelBandejas: Set<number>
}) {
  const bandejas   = Array.from({ length: nBandejas },   (_, i) => i + 1)
  const posiciones = Array.from({ length: nPosiciones }, (_, i) => i + 1)

  // Compute avg GMROI per bandeja for the label
  function avgGmroi(b: number): number | null {
    const vals: number[] = []
    for (const [k, sku] of slots.entries()) {
      if (k.startsWith(`${b}-`) && sku.avg_gmroi != null) vals.push(sku.avg_gmroi)
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="space-y-1.5 min-w-max">
        {/* Column headers */}
        <div className="flex items-center gap-1 pl-14">
          {posiciones.map(p => (
            <div key={p} className="w-[74px] text-center text-[9px] text-muted-foreground/60">{p}</div>
          ))}
        </div>

        {bandejas.map(b => {
          const isEye = eyeLevelBandejas.has(b)
          const avg   = avgGmroi(b)
          return (
            <div key={b} className="flex items-center gap-1">
              {/* Bandeja label */}
              <div className={cn(
                "w-12 shrink-0 text-right pr-1.5",
                isEye ? "text-[var(--brand-magenta)]" : "text-muted-foreground"
              )}>
                <p className={cn("text-[10px] font-bold", isEye && "font-extrabold")}>
                  {isEye ? `★ B${b}` : `B${b}`}
                </p>
                {avg != null && (
                  <p className="text-[8px] tabular-nums" style={{ color: gmroiBg(avg) }}>
                    {avg.toFixed(1)}×
                  </p>
                )}
              </div>

              {/* Cells */}
              <div className="flex gap-0.5">
                {posiciones.map(p => (
                  <ShelfCell key={p} bandeja={b} posicion={p}
                    sku={slots.get(slotKey(b, p))} isEyeLevel={isEye} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Pool item ─────────────────────────────────────────────────────────────────
function PoolItem({ sku }: { sku: SkuInfo }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: POOL_PREFIX + sku.id,
    data: { sku },
  })
  const g = sku.avg_gmroi

  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-card cursor-grab active:cursor-grabbing hover:border-[var(--brand-magenta)] transition-colors"
      style={{ opacity: isDragging ? 0.25 : 1 }}
    >
      {sku.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sku.imagen_url} alt={sku.nombre}
          className="w-8 h-8 object-contain rounded shrink-0" draggable={false} />
      ) : (
        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
          <span className="text-[8px] text-muted-foreground">—</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-tight truncate">{sku.nombre}</p>
        <p className="text-[10px] text-muted-foreground truncate">{sku.marca_nombre ?? "—"}</p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className="text-[9px] font-bold rounded px-1.5 py-0.5 tabular-nums block"
          style={{ background: gmroiBg(g), color: gmroiColor(g) }}
        >
          {g != null ? g.toFixed(2) : "—"}×
        </span>
        {sku.avg_sellthru != null && (
          <span className="text-[8px] text-muted-foreground tabular-nums block mt-0.5">
            ST {sku.avg_sellthru.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── SKU Pool panel ─────────────────────────────────────────────────────────────
type SortMode = "gmroi" | "nombre" | "sellthru"

function SkuPool({ skus, busqueda, onBusqueda }: { skus: SkuInfo[]; busqueda: string; onBusqueda: (v: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool-drop-zone" })
  const [sortMode, setSortMode] = useState<SortMode>("gmroi")

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    const filtered = skus.filter(s =>
      s.nombre.toLowerCase().includes(q) ||
      (s.marca_nombre ?? "").toLowerCase().includes(q)
    )
    return filtered.sort((a, b) => {
      if (sortMode === "gmroi") return (b.avg_gmroi ?? -1) - (a.avg_gmroi ?? -1)
      if (sortMode === "sellthru") return (b.avg_sellthru ?? -1) - (a.avg_sellthru ?? -1)
      return a.nombre.localeCompare(b.nombre, "es")
    })
  }, [skus, busqueda, sortMode])

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full border rounded-xl p-3 gap-2.5 transition-colors",
        isOver ? "bg-[oklch(0.62_0.20_358/0.06)] border-[var(--brand-magenta)]" : "bg-card"
      )}
      style={{ minHeight: 400 }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">SKUs disponibles</p>
          <span className="text-xs text-muted-foreground">{filtrados.length}</span>
        </div>
        <Input
          placeholder="Buscar nombre o marca…"
          value={busqueda}
          onChange={e => onBusqueda(e.target.value)}
          className="h-8 text-xs"
        />
        {/* Sort toggle */}
        <div className="flex rounded-md border p-0.5 bg-muted gap-0.5">
          {([
            { id: "gmroi" as SortMode,    label: "GMROI",   icon: BarChart2 },
            { id: "sellthru" as SortMode, label: "Sellthru",icon: Eye },
            { id: "nombre" as SortMode,   label: "A–Z",     icon: null },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSortMode(id)}
              className={cn(
                "flex-1 text-[10px] py-1 rounded font-medium transition-all",
                sortMode === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {filtrados.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {busqueda ? `Sin resultados para "${busqueda}"` : "Todos los SKUs están asignados al estante"}
          </p>
        ) : (
          filtrados.map(s => <PoolItem key={s.id} sku={s} />)
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center border-t pt-2">
        Arrastra hacia el estante — suelta aquí para quitar del estante
      </p>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────
interface Props {
  planograma: PlanogramData
  skusPool:   PlanogramSku[]
}

export function PlanogramEditor({ planograma, skusPool }: Props) {
  const [isPending, startTransition] = useTransition()
  const [busqueda, setBusqueda]      = useState("")
  const [activeId, setActiveId]      = useState<string | null>(null)
  const [activeSku, setActiveSku]    = useState<SkuInfo | null>(null)

  // ── Build initial slot state from planogram ──────────────────────────────
  const [slots, setSlots] = useState<SlotState>(() => {
    const m = new Map<string, SkuInfo>()
    for (const s of planograma.slots) {
      m.set(slotKey(s.bandeja, s.posicion), {
        ...s.sku,
        avg_gmroi:      s.kpis?.avg_gmroi      ?? null,
        avg_sellthru:   s.kpis?.avg_sellthru   ?? null,
        avg_margen_pct: s.kpis?.avg_margen_pct ?? null,
      })
    }
    return m
  })

  // DB slot id map for saving
  const slotDbIds = new Map<string, string>()
  for (const s of planograma.slots) slotDbIds.set(slotKey(s.bandeja, s.posicion), s.id)

  // Pool = skusPool minus those on the shelf
  const assignedIds = useMemo(() => new Set([...slots.values()].map(s => s.id)), [slots])
  const poolSkus: SkuInfo[] = useMemo(() =>
    skusPool.filter(s => !assignedIds.has(s.id)),
    [skusPool, assignedIds]
  )

  const eyeLevelBandejas = new Set([2, 3])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const vals: number[] = []
    let changed = 0
    for (const [key, sku] of slots.entries()) {
      if (sku.avg_gmroi != null) vals.push(sku.avg_gmroi)
      const orig = planograma.slots.find(s => slotKey(s.bandeja, s.posicion) === key)
      if (orig && orig.sku.id !== sku.id) changed++
    }
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    return { avg_gmroi: avg, changed, filled: slots.size }
  }, [slots, planograma.slots])

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
    setActiveSku((e.active.data.current as { sku: SkuInfo })?.sku ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    setActiveSku(null)
    const { active, over } = e
    if (!over) return

    const aId = active.id as string
    const oId = over.id   as string
    const draggedSku = (active.data.current as { sku: SkuInfo })?.sku
    if (!draggedSku) return

    const fromPool = aId.startsWith(POOL_PREFIX)
    const fromSlot = aId.startsWith(SLOT_PREFIX)
    const toSlot   = oId.startsWith(SLOT_PREFIX)
    const toPool   = oId === "pool-drop-zone"

    if (fromPool && toSlot) {
      const targetKey = oId.slice(SLOT_PREFIX.length)
      setSlots(prev => { const n = new Map(prev); n.set(targetKey, draggedSku); return n })
    } else if (fromSlot && toSlot) {
      const srcKey = aId.slice(SLOT_PREFIX.length)
      const dstKey = oId.slice(SLOT_PREFIX.length)
      if (srcKey === dstKey) return
      setSlots(prev => {
        const n = new Map(prev)
        const src = prev.get(srcKey)
        const dst = prev.get(dstKey)
        if (src && dst) { n.set(srcKey, dst); n.set(dstKey, src) }
        else if (src)   { n.delete(srcKey);   n.set(dstKey, src) }
        return n
      })
    } else if (fromSlot && toPool) {
      const srcKey = aId.slice(SLOT_PREFIX.length)
      setSlots(prev => { const n = new Map(prev); n.delete(srcKey); return n })
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  function handleGuardar() {
    const swaps: { slot_id: string; nuevo_sku_id: string }[] = []
    for (const [key, sku] of slots.entries()) {
      const dbId = slotDbIds.get(key)
      if (!dbId) continue
      const orig = planograma.slots.find(s => slotKey(s.bandeja, s.posicion) === key)
      if (!orig || orig.sku.id !== sku.id) swaps.push({ slot_id: dbId, nuevo_sku_id: sku.id })
    }
    if (swaps.length === 0) { toast.info("Sin cambios para guardar"); return }

    startTransition(async () => {
      const res = await guardarCambios(planograma.id, swaps)
      if (res.ok) toast.success(`Guardado — versión ${res.version ?? ""}`)
      else        toast.error(`Error: ${res.error}`)
    })
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{planograma.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              🏬 {planograma.tienda.nombre} · {planograma.tienda.ciudad} &nbsp;·&nbsp;
              🏷️ {planograma.categoria.nombre}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              onClick={handleGuardar}
              disabled={isPending || stats.changed === 0}
              className="gap-1.5"
            >
              {isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Guardando…</>
                : <><CheckCircle className="h-3.5 w-3.5" />Guardar{stats.changed > 0 ? ` (${stats.changed})` : ""}</>
              }
            </Button>
            <Button
              size="sm" asChild
              style={{ background: "var(--brand-magenta)", color: "#fff" }}
            >
              <a href={`/planogramas/${planograma.id}/simulador`}>Ver simulador →</a>
            </Button>
          </div>
        </div>

        {/* ── Stats bar ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">SKUs en estante</span>
            <span className="font-bold tabular-nums">{stats.filled} / {planograma.n_bandejas * planograma.n_posiciones}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">GMROI promedio</span>
            <span className="font-bold tabular-nums" style={{ color: stats.avg_gmroi ? gmroiBg(stats.avg_gmroi) : undefined }}>
              {stats.avg_gmroi?.toFixed(2) ?? "—"}×
            </span>
          </div>
          {stats.changed > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--brand-magenta)] bg-[oklch(0.97_0.02_358)] px-3 py-1.5">
              <span className="text-[var(--brand-magenta)] font-semibold">{stats.changed} cambio{stats.changed !== 1 ? "s" : ""} sin guardar</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground ml-auto">
            <span>
              <span className="inline-block w-2 h-4 rounded-sm mr-1.5 align-middle" style={{ background: "var(--brand-magenta)" }} />
              Bandejas eye-level (★ B2, B3)
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span>Arrastra SKUs entre celdas o desde el panel lateral</span>
          </div>
        </div>

        <Separator />

        {/* ── Main layout ──────────────────────────────────────────────────── */}
        <div className="flex gap-4 items-start">
          {/* Shelf — 70% */}
          <div className="flex-[7] min-w-0">
            <ShelfGrid
              nBandejas={planograma.n_bandejas}
              nPosiciones={planograma.n_posiciones}
              slots={slots}
              eyeLevelBandejas={eyeLevelBandejas}
            />
          </div>

          {/* Pool — 30% */}
          <div className="flex-[3] min-w-[230px] max-w-[280px] sticky top-4 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">
            <SkuPool skus={poolSkus} busqueda={busqueda} onBusqueda={setBusqueda} />
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeSku && (
          <div style={{
            width: 74, height: 90,
            background: "var(--card)",
            border: "1.5px solid var(--brand-magenta)",
            borderRadius: 6,
            boxShadow: "0 12px 32px rgba(0,0,0,0.20)",
            cursor: "grabbing",
            opacity: 0.95,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <SkuCard sku={activeSku} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
