"use client"

import { useState } from "react"
import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PlanogramData } from "@/lib/planogram/types"

function fmtCLP(v: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v)
}

export function EtiquetasClient({ planograma }: { planograma: PlanogramData }) {
  const [printing, setPrinting] = useState(false)

  function handlePrint() {
    setPrinting(true)
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 120)
  }

  const slots = [...(planograma.slots ?? [])].sort(
    (a, b) => a.bandeja - b.bandeja || a.posicion - b.posicion
  )

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .etiqueta { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="space-y-4">
        {/* Header (no imprime) */}
        <div className="no-print flex items-center justify-between">
          <Link
            href={`/planogramas/${planograma.id}/simulador`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Volver al planograma
          </Link>
          <Button onClick={handlePrint} disabled={printing} size="sm" className="gap-1.5">
            <Printer className="size-3.5" />
            {printing ? "Preparando…" : "Imprimir / Guardar como PDF"}
          </Button>
        </div>

        <div className="no-print">
          <h1 className="text-lg font-semibold">Etiquetas de precio — {planograma.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            {slots.length} etiqueta{slots.length !== 1 ? "s" : ""} — una por posición del planograma.
            Recorta por las líneas punteadas.
          </p>
        </div>

        {/* Grilla de etiquetas */}
        <div className="grid grid-cols-3 gap-3 print:grid-cols-3">
          {slots.map(slot => (
            <div
              key={slot.id}
              className="etiqueta flex flex-col justify-between rounded-md border border-dashed border-muted-foreground/40 bg-white p-2.5"
              style={{ minHeight: 130 }}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="line-clamp-2 text-[11px] font-medium leading-tight">{slot.sku.nombre}</p>
                <QRCodeSVG value={slot.sku.sku_externo} size={32} level="M" />
              </div>
              <p className="text-[9px] text-muted-foreground">{slot.sku.marca_nombre ?? "—"}</p>
              <div className="mt-1 flex items-end justify-between">
                <span className="text-[9px] font-mono text-muted-foreground">
                  {slot.sku.sku_externo} · B{slot.bandeja}-P{slot.posicion}
                </span>
                <span className="text-lg font-bold" style={{ color: "#d4177a" }}>
                  {fmtCLP(slot.sku.precio_lista)}
                </span>
              </div>
            </div>
          ))}
          {slots.length === 0 && (
            <p className="col-span-3 py-10 text-center text-sm text-muted-foreground italic">
              Este planograma no tiene productos asignados.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
