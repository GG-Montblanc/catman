import { Suspense } from "react"
import { SkuTable } from "./SkuTable"
import { MdiView } from "./MdiView"
import { cn } from "@/lib/utils"
import Link from "next/link"

export const metadata = { title: "SKUs — DBS CatMan" }

type Props = {
  searchParams: Promise<{ vista?: string }>
}

export default async function SkusPage({ searchParams }: Props) {
  const params = await searchParams
  const vista = params.vista === "mdi" ? "mdi" : "tabla"

  const pillBase =
    "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border"
  const pillActive =
    "border-transparent text-white bg-[#d4177a]"
  const pillInactive =
    "border-border bg-background text-muted-foreground hover:bg-muted"

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogo SKUs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Análisis de desempeño por producto — GMROI, Sellthru, MDI y más
        </p>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <Link
          href="/skus"
          className={cn(pillBase, vista === "tabla" ? pillActive : pillInactive)}
        >
          Tabla
        </Link>
        <Link
          href="/skus?vista=mdi"
          className={cn(pillBase, vista === "mdi" ? pillActive : pillInactive)}
        >
          Vista MDI
        </Link>
      </div>

      {vista === "mdi" ? (
        <Suspense fallback={<div className="h-96 rounded-xl border bg-muted animate-pulse" />}>
          <MdiView />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="h-96 rounded-xl border bg-muted animate-pulse" />}>
          <SkuTable />
        </Suspense>
      )}
    </div>
  )
}
