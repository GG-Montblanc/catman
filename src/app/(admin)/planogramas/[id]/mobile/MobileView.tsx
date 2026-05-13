"use client"

import { useState } from "react"
import { Check, Package, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

type SkuMobile = {
  id: string
  nombre: string
  marca: string | null
  imagen_url: string | null
  precio_lista: number | null
}

type SlotMobile = {
  bandeja: number
  posicion: number
  frente: number
  sku: SkuMobile
  kpis: { avg_gmroi: number | null } | null
}

type MobileData = {
  planograma: { id: string; nombre: string; n_bandejas: number; n_posiciones: number }
  tienda: { nombre: string; ciudad: string; direccion: string | null }
  categoria: { nombre: string }
  bandejas: SlotMobile[]
}

export function MobileView({ data }: { data: MobileData }) {
  const [done, setDone] = useState<Set<string>>(new Set())

  const slots = (data.bandejas ?? []).sort((a, b) =>
    a.bandeja !== b.bandeja ? a.bandeja - b.bandeja : a.posicion - b.posicion
  )
  const total = slots.length
  const completados = done.size

  function toggle(key: string) {
    setDone(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Group by bandeja
  const bandejas = new Map<number, SlotMobile[]>()
  for (const s of slots) {
    if (!bandejas.has(s.bandeja)) bandejas.set(s.bandeja, [])
    bandejas.get(s.bandeja)!.push(s)
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-[#d4177a] text-white px-4 pt-6 pb-4">
        <p className="text-xs font-medium opacity-70 uppercase tracking-widest">{data.categoria.nombre}</p>
        <h1 className="text-xl font-bold mt-0.5">{data.planograma.nombre}</h1>
        <div className="flex items-center gap-1.5 mt-1 text-sm opacity-80">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>{data.tienda.nombre}</span>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="opacity-80">{completados} de {total} colocados</span>
            <span className="font-bold">{total > 0 ? Math.round(completados / total * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-300"
              style={{ width: `${total > 0 ? (completados / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-5">
        {Array.from(bandejas.entries()).map(([b, bSlots]) => {
          const isEye = b === 2 || b === 3
          const allDone = bSlots.every(s => done.has(`${s.bandeja}-${s.posicion}`))

          return (
            <div key={b}>
              {/* Bandeja label */}
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  "h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center",
                  isEye ? "bg-[#d4177a] text-white" : "bg-gray-200 text-gray-600"
                )}>
                  {b}
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  Bandeja {b}{isEye ? " · ★ Eye level" : ""}
                </span>
                {allDone && <Check className="h-4 w-4 text-emerald-500 ml-auto" />}
              </div>

              {/* Productos */}
              <div className="space-y-2">
                {bSlots.map(slot => {
                  const key = `${slot.bandeja}-${slot.posicion}`
                  const isDone = done.has(key)
                  return (
                    <button
                      key={key}
                      onClick={() => toggle(key)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all active:scale-[0.98] shadow-sm border",
                        isDone
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-white border-gray-100"
                      )}
                    >
                      {/* Imagen */}
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-gray-100 border overflow-hidden">
                        {slot.sku.imagen_url
                          ? <img src={slot.sku.imagen_url} alt="" className="h-full w-full object-contain p-1" />
                          : <div className="h-full w-full flex items-center justify-center">
                              <Package className="h-5 w-5 text-gray-300" />
                            </div>
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold leading-tight line-clamp-2", isDone && "line-through text-gray-400")}>
                          {slot.sku.nombre}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {slot.sku.marca && <>{slot.sku.marca} · </>}
                          Pos {slot.posicion}
                          {slot.frente > 1 && ` · ${slot.frente} frentes`}
                        </p>
                        {slot.sku.precio_lista && (
                          <p className="text-xs font-bold text-gray-700 mt-0.5">
                            {new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(slot.sku.precio_lista)}
                          </p>
                        )}
                      </div>

                      {/* Check */}
                      <div className={cn(
                        "h-8 w-8 shrink-0 rounded-full border-2 flex items-center justify-center transition-all",
                        isDone ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                      )}>
                        {isDone && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Done banner */}
      {completados === total && total > 0 && (
        <div className="fixed bottom-6 inset-x-4 rounded-2xl bg-emerald-500 text-white p-4 flex items-center gap-3 shadow-xl">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">¡Listo!</p>
            <p className="text-sm opacity-80">Todos los productos colocados</p>
          </div>
        </div>
      )}
    </div>
  )
}
