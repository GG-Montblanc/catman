import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { FilterBar } from "./FilterBar"
import { DashboardClient } from "./DashboardClient"
import { RefreshMvButton } from "./RefreshMvButton"

export const metadata = { title: "Dashboard — DBS Category Tracker" }

async function fetchFilterOptions() {
  const sb = await createClient()
  const [tiendas, categorias, marcas] = await Promise.all([
    sb.from("tiendas")
      .select("id, nombre, region, canal, formato")
      .eq("activa", true)
      .order("nombre"),
    sb.from("categorias")
      .select("id, nombre, ruta, nivel")
      .lte("nivel", 2)
      .order("ruta"),
    sb.from("marcas")
      .select("id, nombre")
      .order("nombre"),
  ])
  return {
    tiendas:    tiendas.data    ?? [],
    categorias: categorias.data ?? [],
    marcas:     marcas.data     ?? [],
  }
}

export default async function DashboardPage() {
  const { tiendas, categorias, marcas } = await fetchFilterOptions()

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            KPIs de desempeño del portafolio DBS
          </p>
        </div>
        <RefreshMvButton />
      </div>

      <Suspense fallback={null}>
        <FilterBar
          tiendas={tiendas as any}
          categorias={categorias as any}
          marcas={marcas as any}
        />
      </Suspense>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardClient />
      </Suspense>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-80 rounded-xl border bg-muted animate-pulse" />
    </div>
  )
}
