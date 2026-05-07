"use client"

import { useState, useTransition } from "react"
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { PlanogramData, PlanogramSku } from "@/lib/planogram/types"
import { guardarCambios } from "../simulador/actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type SkuInfo = PlanogramSku & { avg_gmroi?: number | null }

type SlotState = Map<string, SkuInfo> // slotId → sku

// slotId format: "bandeja-posicion" e.g. "2-5"
function slotId(bandeja: number, posicion: number) {
  return `${bandeja}-${posicion}`
}

// draggable id format: slot:slotId  or  pool:skuId
const SLOT_PREFIX = "slot:"
const POOL_PREFIX = "pool:"

// ─── GMROI badge color ────────────────────────────────────────────────────────

function gmroiBadgeStyle(gmroi: number | null | undefined) {
  if (gmroi == null) return { background: "var(--muted)", color: "var(--muted-foreground)" }
  if (gmroi >= 2)   return { background: "oklch(0.80 0.18 150)", color: "#fff" }
  if (gmroi >= 1)   return { background: "oklch(0.78 0.16 85)",  color: "#fff" }
  if (gmroi >= 0.5) return { background: "oklch(0.70 0.16 50)",  color: "#fff" }
  return              { background: "oklch(0.55 0.18 20)",  color: "#fff" }
}

// ─── Draggable SKU card (used in both shelf and overlay) ─────────────────────

function SkuCard({
  sku,
  compact = false,
}: {
  sku: SkuInfo
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 w-full h-full ${compact ? "p-0.5" : "p-1"}`}
    >
      {sku.imagen_url ? (
        <img
          src={sku.imagen_url}
          alt={sku.nombre}
          className="w-8 h-8 object-cover rounded shrink-0"
          draggable={false}
        />
      ) : (
        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
          <span className="text-[9px] text-muted-foreground font-mono">SKU</span>
        </div>
      )}
      <p className="text-[9px] leading-tight text-center line-clamp-2 w-full">
        {sku.nombre}
      </p>
      <span
        className="text-[8px] font-semibold rounded px-1"
        style={gmroiBadgeStyle(sku.avg_gmroi)}
      >
        {sku.avg_gmroi != null ? sku.avg_gmroi.toFixed(2) : "—"}
      </span>
    </div>
  )
}

// ─── Draggable wrapper ────────────────────────────────────────────────────────

function DraggableSku({
  draggableId,
  sku,
  compact,
}: {
  draggableId: string
  sku: SkuInfo
  compact?: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    data: { sku },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing w-full h-full"
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <SkuCard sku={sku} compact={compact} />
    </div>
  )
}

// ─── Droppable shelf cell ──────────────────────────────────────────────────────

function ShelfCell({
  bandeja,
  posicion,
  sku,
  isEyeLevel,
}: {
  bandeja: number
  posicion: number
  sku: SkuInfo | undefined
  isEyeLevel: boolean
}) {
  const id = slotId(bandeja, posicion)
  const { setNodeRef, isOver } = useDroppable({ id: SLOT_PREFIX + id })

  return (
    <div
      ref={setNodeRef}
      className="border rounded-sm transition-colors flex items-center justify-center"
      style={{
        width: 72,
        height: 88,
        borderLeft: isEyeLevel ? "3px solid var(--brand-magenta)" : undefined,
        background: isOver ? "oklch(0.62 0.20 358 / 0.08)" : "var(--card)",
        borderColor: isOver ? "var(--brand-magenta)" : undefined,
      }}
    >
      {sku ? (
        <DraggableSku
          draggableId={SLOT_PREFIX + id}
          sku={sku}
          compact
        />
      ) : (
        <span className="text-[9px] text-muted-foreground/40">{posicion}</span>
      )}
    </div>
  )
}

// ─── ShelfGrid ────────────────────────────────────────────────────────────────

function ShelfGrid({
  nBandejas,
  nPosiciones,
  slots,
  eyeLevelBandejas,
}: {
  nBandejas: number
  nPosiciones: number
  slots: SlotState
  eyeLevelBandejas: Set<number>
}) {
  const bandejas = Array.from({ length: nBandejas }, (_, i) => i + 1)
  const posiciones = Array.from({ length: nPosiciones }, (_, i) => i + 1)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="space-y-1 min-w-max">
        {bandejas.map((b) => (
          <div key={b} className="flex items-center gap-1">
            {/* Bandeja label */}
            <div
              className="text-[10px] font-semibold w-6 shrink-0 text-right"
              style={{ color: eyeLevelBandejas.has(b) ? "var(--brand-magenta)" : "var(--muted-foreground)" }}
            >
              {eyeLevelBandejas.has(b) ? `★B${b}` : `B${b}`}
            </div>
            {/* Cells */}
            <div className="flex gap-0.5">
              {posiciones.map((p) => (
                <ShelfCell
                  key={p}
                  bandeja={b}
                  posicion={p}
                  sku={slots.get(slotId(b, p))}
                  isEyeLevel={eyeLevelBandejas.has(b)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pool item (draggable from pool) ─────────────────────────────────────────

function PoolItem({ sku }: { sku: SkuInfo }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: POOL_PREFIX + sku.id,
    data: { sku },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 p-2 rounded-lg border bg-card cursor-grab active:cursor-grabbing hover:border-[var(--brand-magenta)] transition-colors"
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      {sku.imagen_url ? (
        <img
          src={sku.imagen_url}
          alt={sku.nombre}
          className="w-8 h-8 object-cover rounded shrink-0"
          draggable={false}
        />
      ) : (
        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
          <span className="text-[9px] text-muted-foreground font-mono">SKU</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-tight truncate">{sku.nombre}</p>
        <p className="text-[10px] text-muted-foreground truncate">{sku.marca_nombre ?? "—"}</p>
      </div>
      <span
        className="text-[9px] font-semibold rounded px-1.5 py-0.5 shrink-0"
        style={gmroiBadgeStyle(sku.avg_gmroi)}
      >
        {sku.avg_gmroi != null ? sku.avg_gmroi.toFixed(2) : "—"}
      </span>
    </div>
  )
}

// ─── SkuPool ──────────────────────────────────────────────────────────────────

function SkuPool({
  skus,
  busqueda,
  onBusqueda,
}: {
  skus: SkuInfo[]
  busqueda: string
  onBusqueda: (v: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool-drop-zone" })

  const filtrados = skus.filter((s) => {
    const q = busqueda.toLowerCase()
    return (
      s.nombre.toLowerCase().includes(q) ||
      (s.marca_nombre ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col h-full border rounded-xl p-3 gap-3"
      style={{
        background: isOver ? "oklch(0.62 0.20 358 / 0.06)" : "var(--card)",
        borderColor: isOver ? "var(--brand-magenta)" : undefined,
        minHeight: 400,
      }}
    >
      <div>
        <p className="text-sm font-semibold mb-1.5">SKUs disponibles</p>
        <Input
          placeholder="Buscar por nombre o marca…"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {filtrados.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {busqueda ? "Sin resultados" : "Todos los SKUs están asignados"}
          </p>
        ) : (
          filtrados.map((s) => <PoolItem key={s.id} sku={s} />)
        )}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        {filtrados.length} SKU{filtrados.length !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

// ─── Main PlanogramEditor ─────────────────────────────────────────────────────

interface Props {
  planograma: PlanogramData
  skusPool: PlanogramSku[]
}

export function PlanogramEditor({ planograma, skusPool }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeSku, setActiveSku] = useState<SkuInfo | null>(null)

  // ── Build initial slot state from planogram data ──────────────────────────
  const [slots, setSlots] = useState<SlotState>(() => {
    const map = new Map<string, SkuInfo>()
    for (const s of planograma.slots) {
      const sku: SkuInfo = {
        ...s.sku,
        avg_gmroi: s.kpis?.avg_gmroi ?? null,
      }
      map.set(slotId(s.bandeja, s.posicion), sku)
    }
    return map
  })

  // ── Track which slot maps to which DB slot id (for guardarCambios) ─────────
  const slotDbIds = new Map<string, string>() // slotKey → db slot id
  for (const s of planograma.slots) {
    slotDbIds.set(slotId(s.bandeja, s.posicion), s.id)
  }

  // ── Assigned SKU ids (to exclude from pool) ────────────────────────────────
  const assignedSkuIds = new Set<string>()
  for (const sku of slots.values()) {
    assignedSkuIds.add(sku.id)
  }

  // Pool = all available skus NOT currently in shelf
  const poolSkus: SkuInfo[] = skusPool
    .filter((s) => !assignedSkuIds.has(s.id))
    .map((s) => ({ ...s, avg_gmroi: null }))

  const eyeLevelBandejas = new Set([2, 3])

  // ── DnD handlers ──────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    setActiveSku((event.active.data.current as { sku: SkuInfo })?.sku ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    setActiveSku(null)

    const { active, over } = event
    if (!over) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    const isFromSlot = activeIdStr.startsWith(SLOT_PREFIX)
    const isFromPool = activeIdStr.startsWith(POOL_PREFIX)
    const isToSlot = overIdStr.startsWith(SLOT_PREFIX)
    const isToPool = overIdStr === "pool-drop-zone"

    const draggedSku = (active.data.current as { sku: SkuInfo })?.sku
    if (!draggedSku) return

    // ── pool → slot ────────────────────────────────────────────────────────
    if (isFromPool && isToSlot) {
      const targetKey = overIdStr.slice(SLOT_PREFIX.length)
      setSlots((prev) => {
        const next = new Map(prev)
        next.set(targetKey, draggedSku)
        return next
      })
      return
    }

    // ── slot → slot (swap) ─────────────────────────────────────────────────
    if (isFromSlot && isToSlot) {
      const sourceKey = activeIdStr.slice(SLOT_PREFIX.length)
      const targetKey = overIdStr.slice(SLOT_PREFIX.length)
      if (sourceKey === targetKey) return
      setSlots((prev) => {
        const next = new Map(prev)
        const sourceSku = prev.get(sourceKey)
        const targetSku = prev.get(targetKey)
        if (sourceSku && targetSku) {
          next.set(sourceKey, targetSku)
          next.set(targetKey, sourceSku)
        } else if (sourceSku && !targetSku) {
          next.delete(sourceKey)
          next.set(targetKey, sourceSku)
        }
        return next
      })
      return
    }

    // ── slot → pool (release) ─────────────────────────────────────────────
    if (isFromSlot && isToPool) {
      const sourceKey = activeIdStr.slice(SLOT_PREFIX.length)
      setSlots((prev) => {
        const next = new Map(prev)
        next.delete(sourceKey)
        return next
      })
      return
    }
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  function handleGuardar() {
    // Build swaps: current slot state vs original
    const swaps: { slot_id: string; nuevo_sku_id: string }[] = []

    for (const [key, sku] of slots.entries()) {
      const dbId = slotDbIds.get(key)
      if (!dbId) continue
      const original = planograma.slots.find((s) => slotId(s.bandeja, s.posicion) === key)
      if (!original || original.sku.id !== sku.id) {
        swaps.push({ slot_id: dbId, nuevo_sku_id: sku.id })
      }
    }

    if (swaps.length === 0) {
      setSaveMsg("Sin cambios para guardar.")
      return
    }

    startTransition(async () => {
      setSaveMsg(null)
      const res = await guardarCambios(planograma.id, swaps)
      if (res.ok) {
        setSaveMsg(`Guardado — versión ${res.version ?? ""}`)
      } else {
        setSaveMsg(`Error: ${res.error}`)
      }
    })
  }

  // ── Overlay content ────────────────────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    width: 72,
    height: 88,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    cursor: "grabbing",
    opacity: 0.95,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{planograma.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {planograma.tienda.nombre} · {planograma.tienda.ciudad} · {planograma.categoria.nombre}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: saveMsg.startsWith("Error") ? "oklch(0.55 0.18 20 / 0.1)" : "oklch(0.80 0.18 150 / 0.1)",
                  color: saveMsg.startsWith("Error") ? "oklch(0.55 0.18 20)" : "oklch(0.50 0.18 150)",
                }}
              >
                {saveMsg}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGuardar}
              disabled={isPending}
            >
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              size="sm"
              asChild
              style={{ background: "var(--brand-magenta)", color: "#fff" }}
            >
              <a href={`/planogramas/${planograma.id}/simulador`}>Ver simulador</a>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-4 rounded-sm" style={{ background: "var(--brand-magenta)" }} />
            Bandejas eye-level (B2, B3)
          </span>
          <span>Arrastra SKUs desde el panel lateral o entre celdas</span>
        </div>

        {/* Main layout */}
        <div className="flex gap-4 items-start">
          {/* Shelf grid — 70% */}
          <div className="flex-[7] min-w-0">
            <ShelfGrid
              nBandejas={planograma.n_bandejas}
              nPosiciones={planograma.n_posiciones}
              slots={slots}
              eyeLevelBandejas={eyeLevelBandejas}
            />
          </div>

          {/* SKU pool — 30% */}
          <div className="flex-[3] min-w-[220px] max-w-xs sticky top-4">
            <SkuPool
              skus={poolSkus}
              busqueda={busqueda}
              onBusqueda={setBusqueda}
            />
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeSku && (
          <div style={overlayStyle}>
            <SkuCard sku={activeSku} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
