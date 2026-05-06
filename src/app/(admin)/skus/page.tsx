import { Suspense } from "react"
import { SkuTable } from "./SkuTable"

export const metadata = { title: "SKUs — DBS Category Tracker" }

export default function SkusPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogo SKUs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Análisis de desempeño por producto — GMROI, Sellthru, MDI y más
        </p>
      </div>
      <Suspense fallback={<div className="h-96 rounded-xl border bg-muted animate-pulse" />}>
        <SkuTable />
      </Suspense>
    </div>
  )
}
