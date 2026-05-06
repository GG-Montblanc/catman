"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useCallback } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

type FilterOption = { id: string; nombre: string }

type Tienda = { id: string; nombre: string; region: string; canal: string; formato: string }
type Categoria = { id: string; nombre: string; ruta: string; nivel: number }

type Props = {
  tiendas: Tienda[]
  categorias: Categoria[]
  marcas: FilterOption[]
}

const PERIODOS = [
  { value: "3m",  label: "Últimos 3 meses" },
  { value: "6m",  label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "24m", label: "Últimos 24 meses" },
]

const CANALES   = ["mall", "calle", "outlet"]
const REGIONES  = ["Metropolitana", "Valparaíso", "Biobío", "La Araucanía", "Coquimbo",
                   "Antofagasta", "O'Higgins", "Maule", "Los Lagos", "Tarapacá"]
const FORMATOS  = ["DBS Beauty Store", "Tiendas MakeUp", "Prismology"]

export function FilterBar({ tiendas, categorias, marcas }: Props) {
  const router     = useRouter()
  const pathname   = usePathname()
  const params     = useSearchParams()

  const set = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }, [params, pathname, router])

  const clear = () => router.push(pathname, { scroll: false })

  const hasFilters = params.size > 0

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3">
      {/* Período */}
      <Select
        value={params.get("periodo") ?? "12m"}
        onValueChange={v => set("periodo", v === "12m" ? null : v)}
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {PERIODOS.map(p => (
            <SelectItem key={p.value} value={p.value} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Canal */}
      <Select
        value={params.get("canal") ?? "all"}
        onValueChange={v => set("canal", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todos los canales</SelectItem>
          {CANALES.map(c => (
            <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Región */}
      <Select
        value={params.get("region") ?? "all"}
        onValueChange={v => set("region", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Región" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todas las regiones</SelectItem>
          {REGIONES.map(r => (
            <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Formato */}
      <Select
        value={params.get("formato") ?? "all"}
        onValueChange={v => set("formato", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="Formato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todos los formatos</SelectItem>
          {FORMATOS.map(f => (
            <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Categoría */}
      <Select
        value={params.get("categoria") ?? "all"}
        onValueChange={v => set("categoria", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todas las categorías</SelectItem>
          {categorias.map(c => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.nivel === 2 ? `  ${c.nombre}` : c.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Marca */}
      <Select
        value={params.get("marca") ?? "all"}
        onValueChange={v => set("marca", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue placeholder="Marca" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todas las marcas</SelectItem>
          {marcas.map(m => (
            <SelectItem key={m.id} value={m.id} className="text-xs">{m.nombre}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Tienda */}
      <Select
        value={params.get("tienda") ?? "all"}
        onValueChange={v => set("tienda", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-48 text-xs">
          <SelectValue placeholder="Tienda" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">Todas las tiendas</SelectItem>
          {tiendas.map(t => (
            <SelectItem key={t.id} value={t.id} className="text-xs">{t.nombre}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clear}>
          <X className="h-3.5 w-3.5 mr-1" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
