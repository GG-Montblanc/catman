"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import Papa from "papaparse"
import { ArrowLeft, Upload, FileWarning, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { importarSkus, type ImportRow, type ImportResultado } from "./actions"

const COLUMNAS_ESPERADAS = ["sku_externo", "precio_lista", "precio_oferta", "costo_unitario", "categoria", "activo"]

function parseRow(raw: Record<string, string>): ImportRow | null {
  const sku_externo = (raw.sku_externo ?? raw.SKU ?? raw.sku ?? "").trim()
  if (!sku_externo) return null

  const num = (v: string | undefined) => {
    if (v == null || v.trim() === "") return undefined
    const n = Number(v.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."))
    return Number.isNaN(n) ? undefined : n
  }

  return {
    sku_externo,
    precio_lista: num(raw.precio_lista),
    precio_oferta: raw.precio_oferta?.trim() === "" ? undefined : num(raw.precio_oferta) ?? null,
    costo_unitario: num(raw.costo_unitario),
    categoria: raw.categoria?.trim() || undefined,
    activo: raw.activo != null && raw.activo.trim() !== ""
      ? ["1", "true", "si", "sí", "activo"].includes(raw.activo.trim().toLowerCase())
      : undefined,
  }
}

export function ImportarClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<ImportResultado | { error: string } | null>(null)

  function handleFile(file: File) {
    setFileName(file.name)
    setParseError(null)
    setResultado(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields ?? []
        const reconocidas = headers.filter(h => COLUMNAS_ESPERADAS.includes(h.trim().toLowerCase()))
        if (reconocidas.length === 0 && !headers.some(h => /sku/i.test(h))) {
          setParseError(`No se reconoce ninguna columna esperada. Columnas encontradas: ${headers.join(", ")}`)
          setRows([])
          return
        }
        const parsed = res.data.map(parseRow).filter((r): r is ImportRow => r !== null)
        setRows(parsed)
      },
      error: (err) => setParseError(err.message),
    })
  }

  async function handleImportar() {
    setImporting(true)
    const res = await importarSkus(rows)
    setResultado(res)
    setImporting(false)
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
      <div>
        <Link href="/skus" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-4" />
          Volver a SKUs
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Importar catálogo</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Actualiza precio, costo, categoría o estado activo de SKUs existentes desde un CSV exportado del ERP.
          No crea productos nuevos — solo actualiza los que ya existen en el catálogo (por <code>sku_externo</code>).
        </p>
      </div>

      {/* Formato esperado */}
      <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground">Columnas reconocidas (todas opcionales salvo sku_externo):</p>
        <code className="block bg-background rounded px-2 py-1 border">
          sku_externo, precio_lista, precio_oferta, costo_unitario, categoria, activo
        </code>
        <p>Solo se actualizan las columnas presentes en el archivo — las demás quedan sin cambios.</p>
      </div>

      {/* Uploader */}
      <div
        className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
      >
        <Upload className="mx-auto size-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          {fileName ?? "Arrastra un CSV aquí o haz clic para seleccionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Formato .csv, con encabezados</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </div>

      {parseError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 p-3 text-sm text-rose-800 dark:text-rose-300 flex items-start gap-2">
          <FileWarning className="size-4 shrink-0 mt-0.5" />
          {parseError}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !resultado && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{rows.length} filas detectadas</p>
            <Button onClick={handleImportar} disabled={importing} className="gap-1.5">
              {importing ? "Importando…" : `Importar ${rows.length} fila${rows.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">sku_externo</th>
                    <th className="text-right px-3 py-2 font-semibold">precio_lista</th>
                    <th className="text-right px-3 py-2 font-semibold">precio_oferta</th>
                    <th className="text-right px-3 py-2 font-semibold">costo_unitario</th>
                    <th className="text-left px-3 py-2 font-semibold">categoria</th>
                    <th className="text-center px-3 py-2 font-semibold">activo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono">{r.sku_externo}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.precio_lista ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.precio_oferta ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.costo_unitario ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.categoria ?? "—"}</td>
                      <td className="px-3 py-1.5 text-center">{r.activo === undefined ? "—" : r.activo ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 50 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                Mostrando 50 de {rows.length} filas
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        "error" in resultado ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 p-3 text-sm text-rose-800 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            {resultado.error}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" />
              {resultado.actualizados} SKU{resultado.actualizados !== 1 ? "s" : ""} actualizado{resultado.actualizados !== 1 ? "s" : ""}
            </div>
            {resultado.no_encontrados.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <Badge variant="secondary">{resultado.no_encontrados.length}</Badge>
                  No encontrados en el catálogo (omitidos)
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {resultado.no_encontrados.slice(0, 20).join(", ")}
                  {resultado.no_encontrados.length > 20 && ` … +${resultado.no_encontrados.length - 20} más`}
                </p>
              </div>
            )}
            {resultado.categoria_no_encontrada.length > 0 && (
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3 text-sm space-y-1">
                <p className="font-medium">Categorías no reconocidas (esa columna se omitió para esos SKU)</p>
                <p className="text-xs text-muted-foreground">
                  {resultado.categoria_no_encontrada.slice(0, 20).join(" · ")}
                </p>
              </div>
            )}
            {resultado.errores.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 p-3 text-sm space-y-1">
                <p className="font-medium">{resultado.errores.length} errores</p>
                {resultado.errores.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{e.sku_externo}: {e.error}</p>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => { setRows([]); setResultado(null); setFileName(null) }}
            >
              Importar otro archivo
            </Button>
          </div>
        )
      )}
    </div>
  )
}
