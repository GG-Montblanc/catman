"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function RefreshMvButton() {
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    setLoading(true)
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET_HINT ?? ""
      const res = await fetch("/api/cron/refresh-mv", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error al refrescar")
      toast.success("KPIs actualizados", {
        description: `Refrescado en ${json.elapsed_ms}ms`,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error("No se pudo refrescar", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={loading}
      className="gap-1.5 text-xs"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      {loading ? "Refrescando…" : "Refrescar KPIs"}
    </Button>
  )
}
