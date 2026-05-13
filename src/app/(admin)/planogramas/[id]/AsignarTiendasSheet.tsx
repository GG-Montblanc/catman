"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Check, Loader2, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

type Tienda = {
  id: string
  nombre: string
  ciudad: string
  formato: string | null
  activa: boolean
}

type Asignacion = {
  id: string
  tienda_id: string
  activa: boolean
}

export function AsignarTiendasSheet({
  planogramaId,
  planogramaNombre,
}: {
  planogramaId: string
  planogramaNombre: string
}) {
  const [open, setOpen]               = useState(false)
  const [tiendas, setTiendas]         = useState<Tienda[]>([])
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [search, setSearch]           = useState("")
  const [loading, setLoading]         = useState(false)
  const [saving, setSaving]           = useState<string | null>(null) // tienda_id being saved
  const sb = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: tds }, { data: asig }] = await Promise.all([
      sb.from("tiendas").select("id, nombre, ciudad, formato, activa").eq("activa", true).order("nombre"),
      (sb as any).from("planograma_tiendas")
        .select("id, tienda_id, activa")
        .eq("planograma_id", planogramaId),
    ])
    setTiendas((tds ?? []) as Tienda[])
    setAsignaciones((asig ?? []) as Asignacion[])
    setLoading(false)
  }, [planogramaId, sb])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const assignedIds = new Set(
    asignaciones.filter(a => a.activa).map(a => a.tienda_id)
  )

  async function toggleTienda(tiendaId: string) {
    setSaving(tiendaId)
    const existing = asignaciones.find(a => a.tienda_id === tiendaId)

    if (existing) {
      // Toggle activa
      const { error } = await (sb as any)
        .from("planograma_tiendas")
        .update({ activa: !existing.activa })
        .eq("id", existing.id)

      if (!error) {
        setAsignaciones(prev =>
          prev.map(a => a.id === existing.id ? { ...a, activa: !a.activa } : a)
        )
      }
    } else {
      // New assignment
      const { data, error } = await (sb as any)
        .from("planograma_tiendas")
        .insert({
          planograma_id: planogramaId,
          tienda_id: tiendaId,
          activa: true,
        })
        .select("id, tienda_id, activa")
        .single()

      if (!error && data) {
        setAsignaciones(prev => [...prev, data as Asignacion])
      }
    }
    setSaving(null)
  }

  const filtered = tiendas.filter(t => {
    const q = search.toLowerCase()
    return t.nombre.toLowerCase().includes(q) || t.ciudad.toLowerCase().includes(q)
  })

  // Group by formato
  const byFormato: Record<string, Tienda[]> = {}
  for (const t of filtered) {
    const key = t.formato ?? "Sin formato"
    if (!byFormato[key]) byFormato[key] = []
    byFormato[key].push(t)
  }

  const totalAsignadas = assignedIds.size

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Building2 className="h-3.5 w-3.5" />
          Tiendas
          {totalAsignadas > 0 && (
            <Badge className="ml-0.5 h-4 w-4 p-0 text-[10px] rounded-full flex items-center justify-center bg-[var(--brand-magenta)] text-white border-0">
              {totalAsignadas}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <SheetTitle className="text-base">Asignar a tiendas</SheetTitle>
          <SheetDescription className="text-xs">
            {planogramaNombre}
          </SheetDescription>
          {totalAsignadas > 0 && (
            <p className="text-xs font-medium text-[var(--brand-magenta)] mt-1">
              {totalAsignadas} tienda{totalAsignadas !== 1 ? "s" : ""} asignada{totalAsignadas !== 1 ? "s" : ""}
            </p>
          )}
        </SheetHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tienda o ciudad…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tiendas list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sin tiendas que coincidan
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(byFormato).sort(([a], [b]) => a.localeCompare(b)).map(([formato, tds]) => (
                <div key={formato}>
                  <div className="px-4 py-2 bg-muted/30 sticky top-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {formato}
                    </p>
                  </div>
                  {tds.map(tienda => {
                    const isAssigned = assignedIds.has(tienda.id)
                    const isSaving   = saving === tienda.id

                    return (
                      <button
                        key={tienda.id}
                        onClick={() => toggleTienda(tienda.id)}
                        disabled={isSaving}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                          isAssigned && "bg-[oklch(0.97_0.01_358)]"
                        )}
                      >
                        {/* Check or Plus */}
                        <div
                          className={cn(
                            "h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                            isAssigned
                              ? "bg-[var(--brand-magenta)] border-[var(--brand-magenta)]"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                          ) : isAssigned ? (
                            <Check className="h-3.5 w-3.5 text-white" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 text-muted-foreground/50" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">{tienda.nombre}</p>
                          <p className="text-xs text-muted-foreground">{tienda.ciudad}</p>
                        </div>

                        {isAssigned && (
                          <Badge className="text-[10px] shrink-0 bg-[oklch(0.62_0.20_358/0.15)] text-[var(--brand-magenta)] border-0">
                            Asignada
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4 flex items-center justify-between bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {totalAsignadas} de {tiendas.length} tiendas asignadas
          </p>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Listo
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
