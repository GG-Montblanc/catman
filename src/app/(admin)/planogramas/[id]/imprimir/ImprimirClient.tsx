"use client"

import { useState } from "react"
import Link from "next/link"
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

export function ImprimirClient({ planograma }: { planograma: PlanogramData }) {
  const [printing, setPrinting] = useState(false)

  function handlePrint() {
    setPrinting(true)
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 120)
  }

  const bandejas = new Map<number, typeof planograma.slots>()
  for (let b = 1; b <= planograma.n_bandejas; b++) bandejas.set(b, [])
  for (const slot of planograma.slots ?? []) {
    const arr = bandejas.get(slot.bandeja) ?? []
    arr.push(slot)
    bandejas.set(slot.bandeja, arr)
  }
  // Bandeja 1 = arriba visualmente, así que se imprime de mayor a menor número
  const bandejasOrdenadas = Array.from(bandejas.entries()).sort((a, b) => a[0] - b[0])

  const fecha = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm 10mm 10mm 10mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bandeja-block { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="space-y-4">
        {/* Header (no imprime) */}
        <div className="no-print flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/planogramas/${planograma.id}/simulador`} className="flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-4" />
              Volver al planograma
            </Link>
          </div>
          <Button onClick={handlePrint} disabled={printing} size="sm" className="gap-1.5">
            <Printer className="size-3.5" />
            {printing ? "Preparando…" : "Imprimir / Guardar como PDF"}
          </Button>
        </div>

        {/* Documento imprimible */}
        <div className="rounded-xl border bg-white p-6 space-y-5 print:border-0 print:rounded-none print:p-0">
          {/* Header del documento */}
          <div className="flex items-start justify-between border-b-2 pb-3" style={{ borderColor: "#d4177a" }}>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-extrabold text-white"
                  style={{ background: "#d4177a" }}
                >
                  DBS
                </div>
                <span className="text-[11px] font-semibold tracking-widest text-muted-foreground">CATMAN</span>
              </div>
              <h1 className="text-xl font-bold leading-tight">{planograma.nombre}</h1>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>🏬 {planograma.tienda.nombre} — {planograma.tienda.ciudad}</span>
                <span>🏷️ {planograma.categoria.nombre}</span>
                <span>📅 {fecha}</span>
                <span>{planograma.n_bandejas} bandejas · {planograma.n_posiciones} posiciones</span>
              </div>
            </div>
          </div>

          {/* Bandejas — diagrama visual, bandeja 1 arriba (mas baja fisicamente en muchos casos, pero orden de captura) */}
          <div className="space-y-4">
            {bandejasOrdenadas.map(([numBandeja, slots]) => {
              const isEyeLevel = numBandeja === 2 || numBandeja === 3
              const ordenadas = [...slots].sort((a, b) => a.posicion - b.posicion)
              return (
                <div key={numBandeja} className="bandeja-block">
                  <div
                    className="flex items-center gap-2 rounded-t-md border-b px-3 py-1.5"
                    style={{ background: isEyeLevel ? "#fef3c7" : "#f3f4f6" }}
                  >
                    {isEyeLevel && <span className="text-sm">⭐</span>}
                    <span className="text-sm font-bold">Bandeja {numBandeja}</span>
                    {isEyeLevel && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-amber-800" style={{ background: "#fde68a" }}>
                        Eye Level
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {ordenadas.length} posicion{ordenadas.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto rounded-b-md border border-t-0 bg-muted/20 p-2">
                    {ordenadas.length === 0 ? (
                      <div className="flex h-24 w-full items-center justify-center text-xs text-muted-foreground italic">
                        Sin productos asignados
                      </div>
                    ) : (
                      ordenadas.map(slot => (
                        <div
                          key={slot.id}
                          className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-md border bg-white p-2 text-center"
                        >
                          <span className="self-start text-[10px] font-mono text-muted-foreground">#{slot.posicion}</span>
                          {slot.sku.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slot.sku.imagen_url}
                              alt={slot.sku.nombre}
                              className="h-14 w-14 object-contain"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">
                              Sin img
                            </div>
                          )}
                          <p className="line-clamp-2 text-[10px] font-medium leading-tight">{slot.sku.nombre}</p>
                          <p className="text-[9px] text-muted-foreground">{slot.sku.marca_nombre ?? "—"}</p>
                          <p className="text-[10px] font-semibold">{fmtCLP(slot.sku.precio_lista)}</p>
                          {slot.frente > 1 && (
                            <span className="text-[9px] text-muted-foreground">×{slot.frente} frentes</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
            <span>DBS CatMan — Diagrama de planograma generado automáticamente</span>
            <span>{fecha}</span>
          </div>
        </div>
      </div>
    </>
  )
}
