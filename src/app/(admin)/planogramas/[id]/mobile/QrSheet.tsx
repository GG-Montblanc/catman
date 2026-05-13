"use client"

import { QRCodeSVG } from "qrcode.react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Smartphone } from "lucide-react"
import { useState } from "react"

export function QrButton({ planogramaId, nombre }: { planogramaId: string; nombre: string }) {
  const [open, setOpen] = useState(false)
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/planogramas/${planogramaId}/mobile`
    : `/planogramas/${planogramaId}/mobile`

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Smartphone className="h-4 w-4" />
        Vista local
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm flex flex-col items-center justify-center gap-6 text-center">
          <SheetHeader>
            <SheetTitle>Vista para el local</SheetTitle>
            <p className="text-sm text-muted-foreground">
              Escanea el QR con el celular del local para ver el planograma optimizado para colocación de productos.
            </p>
          </SheetHeader>

          <div className="rounded-2xl border p-4 bg-white shadow-sm">
            <QRCodeSVG
              value={url}
              size={220}
              level="H"
              includeMargin={false}
              fgColor="#1a1a1a"
            />
          </div>

          <div className="space-y-2 w-full">
            <p className="text-xs text-muted-foreground font-medium truncate">{url}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigator.clipboard.writeText(url)}
            >
              Copiar link
            </Button>
            <Button
              className="w-full"
              style={{ background: "var(--brand-magenta)", color: "#fff" }}
              asChild
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                Abrir en esta pestaña
              </a>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
