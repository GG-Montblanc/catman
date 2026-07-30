"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Check, Package, MapPin, Camera, Trash2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

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

type FotoCompliance = {
  id: string
  bandeja: number | null
  foto_url: string
  nota: string | null
  subido_por_nombre: string | null
  subido_en: string
}

export function MobileView({ data }: { data: MobileData }) {
  const sb = createClient()
  const planogramaId = data.planograma.id

  const [done, setDone] = useState<Set<string>>(new Set())
  const [fotos, setFotos] = useState<FotoCompliance[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cargarChecklist = useCallback(async () => {
    const { data: rows } = await (sb.rpc as any)("get_checklist_planograma", { p_planograma_id: planogramaId })
    const next = new Set<string>()
    for (const r of rows ?? []) {
      if (r.cumplido) next.add(`${r.bandeja}-${r.posicion}`)
    }
    setDone(next)
  }, [sb, planogramaId])

  const cargarFotos = useCallback(async () => {
    const { data: rows } = await (sb.rpc as any)("get_fotos_compliance", { p_planograma_id: planogramaId })
    setFotos((rows ?? []) as FotoCompliance[])
  }, [sb, planogramaId])

  useEffect(() => {
    cargarChecklist()
    cargarFotos()
  }, [cargarChecklist, cargarFotos])

  const slots = (data.bandejas ?? []).sort((a, b) =>
    a.bandeja !== b.bandeja ? a.bandeja - b.bandeja : a.posicion - b.posicion
  )
  const total = slots.length
  const completados = done.size

  function toggle(bandeja: number, posicion: number) {
    const key = `${bandeja}-${posicion}`
    const nuevoValor = !done.has(key)
    setDone(prev => {
      const next = new Set(prev)
      nuevoValor ? next.add(key) : next.delete(key)
      return next
    })
    // Persistir — optimista, sin bloquear la UI
    ;(sb.rpc as any)("marcar_checklist_item", {
      p_planograma_id: planogramaId,
      p_bandeja: bandeja,
      p_posicion: posicion,
      p_cumplido: nuevoValor,
    })
  }

  async function handleSubirFoto(file: File) {
    setSubiendo(true)
    try {
      const ext = file.name.split(".").pop() ?? "jpg"
      const path = `${planogramaId}/${Date.now()}.${ext}`
      const { error: uploadError } = await sb.storage.from("compliance-fotos").upload(path, file)
      if (uploadError) throw uploadError

      const { data: urlData } = sb.storage.from("compliance-fotos").getPublicUrl(path)
      const { error: rpcError } = await (sb.rpc as any)("registrar_foto_compliance", {
        p_planograma_id: planogramaId,
        p_bandeja: null,
        p_foto_url: urlData.publicUrl,
        p_nota: null,
      })
      if (rpcError) throw rpcError
      await cargarFotos()
    } catch (err) {
      alert(`Error al subir la foto: ${err instanceof Error ? err.message : "desconocido"}`)
    } finally {
      setSubiendo(false)
    }
  }

  async function handleEliminarFoto(foto: FotoCompliance) {
    if (!confirm("¿Eliminar esta foto?")) return
    await (sb.rpc as any)("eliminar_foto_compliance", { p_foto_id: foto.id })
    setFotos(prev => prev.filter(f => f.id !== foto.id))
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

      {/* Fotos de compliance */}
      <div className="px-4 pt-4">
        <div className="rounded-xl bg-white border p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Camera className="h-4 w-4" />
              Fotos del planograma real
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={subiendo}
              className="flex items-center gap-1 rounded-lg bg-[#d4177a] text-white text-xs font-medium px-3 py-1.5 disabled:opacity-60"
            >
              <Upload className="h-3 w-3" />
              {subiendo ? "Subiendo…" : "Subir foto"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleSubirFoto(f)
                e.target.value = ""
              }}
            />
          </div>
          {fotos.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Sin fotos aún — documenta cómo quedó el mueble real.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {fotos.map(f => (
                <div key={f.id} className="relative shrink-0">
                  <img src={f.foto_url} alt="" className="h-20 w-20 rounded-lg object-cover border" />
                  <button
                    onClick={() => handleEliminarFoto(f)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
                      onClick={() => toggle(slot.bandeja, slot.posicion)}
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
