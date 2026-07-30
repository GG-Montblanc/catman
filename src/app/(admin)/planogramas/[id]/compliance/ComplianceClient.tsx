"use client"

import Link from "next/link"
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { PlanogramData } from "@/lib/planogram/types"

type FotoCompliance = {
  id: string
  bandeja: number | null
  foto_url: string
  nota: string | null
  subido_por_nombre: string | null
  subido_en: string
}

type ChecklistItem = {
  bandeja: number
  posicion: number
  cumplido: boolean
  marcado_por_nombre: string | null
  marcado_en: string
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function ComplianceClient({
  planograma,
  fotos,
  checklist,
}: {
  planograma: PlanogramData
  fotos: FotoCompliance[]
  checklist: ChecklistItem[]
}) {
  const bandejas = Array.from({ length: planograma.n_bandejas }, (_, i) => i + 1)
  const cumplidos = checklist.filter(c => c.cumplido).length
  const totalSlots = planograma.slots.length
  const ultimaMarca = checklist
    .filter(c => c.marcado_por_nombre)
    .sort((a, b) => new Date(b.marcado_en).getTime() - new Date(a.marcado_en).getTime())[0]

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <Link href={`/planogramas/${planograma.id}/simulador`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-4" />
          Volver al planograma
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Compliance: ideal vs. real</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {planograma.nombre} — {planograma.tienda.nombre}, {planograma.tienda.ciudad}
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Checklist cumplido</p>
          <p className="text-2xl font-bold tabular-nums">
            {cumplidos}/{totalSlots}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalSlots > 0 ? `${((cumplidos / totalSlots) * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Fotos documentadas</p>
          <p className="text-2xl font-bold tabular-nums">{fotos.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground mb-1">Última actividad</p>
          <p className="text-sm font-medium">
            {ultimaMarca ? `${ultimaMarca.marcado_por_nombre} · ${fmtFecha(ultimaMarca.marcado_en)}` : "Sin registro aún"}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Ideal */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Diseño ideal</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {bandejas.map(b => {
              const slotsBandeja = planograma.slots
                .filter(s => s.bandeja === b)
                .sort((a, c) => a.posicion - c.posicion)
              const checklistBandeja = checklist.filter(c => c.bandeja === b)
              const cumplidosBandeja = checklistBandeja.filter(c => c.cumplido).length
              return (
                <div key={b} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                    <span className="text-xs font-semibold">Bandeja {b}</span>
                    <Badge variant={cumplidosBandeja === slotsBandeja.length && slotsBandeja.length > 0 ? "default" : "secondary"} className="text-[10px]">
                      {cumplidosBandeja}/{slotsBandeja.length} ✓
                    </Badge>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto p-2">
                    {slotsBandeja.map(slot => (
                      <div key={slot.id} className="flex w-14 shrink-0 flex-col items-center gap-0.5">
                        {slot.sku.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={slot.sku.imagen_url} alt={slot.sku.nombre} className="h-10 w-10 object-contain" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                        <p className="line-clamp-1 text-[9px] text-center leading-tight">{slot.sku.nombre}</p>
                      </div>
                    ))}
                    {slotsBandeja.length === 0 && (
                      <p className="text-xs text-muted-foreground italic px-2 py-3">Vacía</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Real (fotos) */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            Implementación real (fotos de tienda)
          </h3>
          {fotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-center text-sm text-muted-foreground">
              <Camera className="h-10 w-10 text-muted-foreground/20" />
              <p>Sin fotos aún.</p>
              <p className="text-xs">Se suben desde la vista móvil (<code>/mobile</code>) en la tienda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto">
              {fotos.map(f => (
                <div key={f.id} className="rounded-lg border overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.foto_url} alt="" className="w-full h-32 object-cover" />
                  <div className="p-2 space-y-0.5">
                    <p className="text-[11px] font-medium">
                      {f.bandeja ? `Bandeja ${f.bandeja}` : "Foto general"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.subido_por_nombre ?? "—"} · {fmtFecha(f.subido_en)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
