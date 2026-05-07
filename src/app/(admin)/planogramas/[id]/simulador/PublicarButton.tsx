"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { publicarPlanograma } from "./actions"

type Props = {
  planogramaId: string
}

export function PublicarButton({ planogramaId }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ token: string; url: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await publicarPlanograma(planogramaId)
      if (!res.ok) {
        toast.error(`Error al publicar: ${res.error}`)
        return
      }
      setResult({ token: res.token, url: res.url })
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        className="gap-1.5"
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Publicando...
          </>
        ) : (
          <>
            <Send className="h-3.5 w-3.5" />
            Enviar a tienda
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>✅ Planograma publicado</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              El planograma ya está disponible para el reponedor en tienda.
            </p>

            {/* URL copiable */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Link público
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={result?.url ?? ""}
                  className="flex-1 rounded-md border bg-muted px-3 py-1.5 text-sm font-mono truncate focus:outline-none"
                />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? "Copiado ✓" : "Copiar link"}
                </Button>
              </div>
            </div>

            {/* QR — URL en código grande */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Código para acceso directo
              </label>
              <div className="rounded-md border bg-muted p-4 text-center">
                <code className="break-all text-sm font-mono leading-relaxed">
                  {result?.url}
                </code>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
              <Button
                onClick={() => result && window.open(result.url, "_blank")}
              >
                Ver vista reponedor
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
