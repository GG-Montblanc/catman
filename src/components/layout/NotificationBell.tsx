"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, CheckCheck, LayoutGrid } from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Notificacion = {
  id: string
  tipo: string
  mensaje: string
  planograma_id: string | null
  tienda_id: string | null
  creado_en: string
  leida: boolean
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  const hr = Math.floor(diff / 3_600_000)
  const day = Math.floor(diff / 86_400_000)
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min}m`
  if (hr < 24) return `hace ${hr}h`
  return `hace ${day}d`
}

export function NotificationBell() {
  const sb = createClient()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: count = 0 } = useQuery({
    queryKey: ["notif_count"],
    queryFn: async () => {
      const { data } = await (sb.rpc as any)("contar_notificaciones_no_leidas", {})
      return (data as number) ?? 0
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  const { data: notificaciones = [] } = useQuery({
    queryKey: ["notif_list"],
    queryFn: async () => {
      const { data } = await (sb.rpc as any)("get_notificaciones", { p_limit: 15 })
      return (data as Notificacion[]) ?? []
    },
    enabled: open,
    staleTime: 30 * 1000,
  })

  async function marcarTodas() {
    await (sb.rpc as any)("marcar_todas_notificaciones_leidas", {})
    qc.invalidateQueries({ queryKey: ["notif_count"] })
    qc.invalidateQueries({ queryKey: ["notif_list"] })
  }

  async function marcarUna(id: string) {
    await (sb.rpc as any)("marcar_notificacion_leida", { p_notificacion_id: id })
    qc.invalidateQueries({ queryKey: ["notif_count"] })
    qc.invalidateQueries({ queryKey: ["notif_list"] })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center justify-center rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors">
          <Bell className="size-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-magenta)] px-1 text-[9px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notificaciones</span>
          {count > 0 && (
            <button
              onClick={marcarTodas}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3" />
              Marcar todas leídas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notificaciones.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Sin notificaciones</p>
          ) : (
            notificaciones.map(n => (
              <Link
                key={n.id}
                href={n.planograma_id ? `/planogramas/${n.planograma_id}/simulador` : "#"}
                onClick={() => !n.leida && marcarUna(n.id)}
                className={cn(
                  "flex items-start gap-2 px-3 py-2.5 text-sm border-b last:border-0 hover:bg-muted/40 transition-colors",
                  !n.leida && "bg-[oklch(0.97_0.02_358)]"
                )}
              >
                <LayoutGrid className={cn("size-3.5 mt-0.5 shrink-0", !n.leida ? "text-[var(--brand-magenta)]" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <p className={cn("text-xs leading-snug", !n.leida && "font-medium")}>{n.mensaje}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.creado_en)}</p>
                </div>
                {!n.leida && <span className="ml-auto mt-1 h-1.5 w-1.5 rounded-full bg-[var(--brand-magenta)] shrink-0" />}
              </Link>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
