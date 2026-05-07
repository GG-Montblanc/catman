"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { crearPlanograma } from "./actions"
import type { GenerateConfig } from "./actions"

// ─── Props ────────────────────────────────────────────────────────────────────

type Tienda = { id: string; nombre: string; ciudad: string }
type Categoria = { id: string; nombre: string; ruta: string }

interface Props {
  tiendas: Tienda[]
  categorias: Categoria[]
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = ["Tienda & Categoría", "Configuración", "Generar"]

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, idx) => {
        const isActive = idx === current
        const isDone = idx < current
        return (
          <div key={idx} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors"
                style={
                  isActive
                    ? { background: "var(--brand-magenta)", color: "#fff" }
                    : isDone
                    ? { background: "oklch(0.62 0.20 358 / 0.15)", color: "var(--brand-magenta)", border: "1.5px solid var(--brand-magenta)" }
                    : { background: "var(--muted)", color: "var(--muted-foreground)" }
                }
              >
                {isDone ? "✓" : idx + 1}
              </div>
              <span
                className="text-xs font-medium hidden sm:block"
                style={{ color: isActive ? "var(--brand-magenta)" : "var(--muted-foreground)" }}
              >
                {label}
              </span>
            </div>
            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className="flex-1 h-px mx-2"
                style={{
                  background: isDone ? "var(--brand-magenta)" : "var(--border)",
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Simple Switch (no shadcn switch component available) ─────────────────────

function SwitchToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  id: string
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        background: checked ? "var(--brand-magenta)" : "var(--muted)",
      }}
    >
      <span
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WizardClient({ tiendas, categorias }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Step 1 state
  const [tiendaId, setTiendaId] = useState<string>("")
  const [categoriaId, setCategoriaId] = useState<string>("")
  const [nombre, setNombre] = useState<string>("")

  // Step 2 state
  const [optimizarPor, setOptimizarPor] = useState<GenerateConfig["optimizar_por"]>("gmroi")
  const [agrupacion, setAgrupacion] = useState<GenerateConfig["agrupacion"]>("marca")
  const [nBandejas, setNBandejas] = useState(5)
  const [nPosiciones, setNPosiciones] = useState(20)
  const [incluirSkuC, setIncluirSkuC] = useState(false)

  // Step 3 state
  const [result, setResult] = useState<{ planogramaId: string } | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const tiendaObj = tiendas.find((t) => t.id === tiendaId)
  const categoriaObj = categorias.find((c) => c.id === categoriaId)

  function buildNombreDefault() {
    const fechaStr = new Date().toLocaleDateString("es-CL", { year: "numeric", month: "2-digit", day: "2-digit" })
    return `${categoriaObj?.nombre ?? "Planograma"} — ${tiendaObj?.nombre ?? ""} — ${fechaStr}`
  }

  // ── Step navigation ────────────────────────────────────────────────────────
  function goNext() {
    if (step === 0 && nombre.trim() === "") {
      setNombre(buildNombreDefault())
    }
    setStep((s) => s + 1)
  }
  function goBack() {
    setStep((s) => s - 1)
    setResult(null)
    setGenError(null)
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  function handleGenerar() {
    const config: GenerateConfig = {
      tienda_id:          tiendaId,
      categoria_id:       categoriaId,
      n_bandejas:         nBandejas,
      n_posiciones:       nPosiciones,
      optimizar_por:      optimizarPor,
      agrupacion:         agrupacion,
      eye_level_bandejas: [2, 3],
      incluir_sku_c:      incluirSkuC,
    }

    startTransition(async () => {
      setResult(null)
      setGenError(null)
      const res = await crearPlanograma(nombre || buildNombreDefault(), config)
      if (res.ok) {
        setResult({ planogramaId: res.planogramaId })
      } else {
        setGenError(res.error)
      }
    })
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const step0Valid = tiendaId !== "" && categoriaId !== ""

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      <Stepper current={step} />

      {/* ── Step 0: Tienda & Categoría ──────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tienda y categoría</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tienda">Tienda</Label>
              <Select value={tiendaId} onValueChange={setTiendaId}>
                <SelectTrigger id="tienda">
                  <SelectValue placeholder="Selecciona una tienda…" />
                </SelectTrigger>
                <SelectContent>
                  {tiendas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre} — {t.ciudad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria">Categoría raíz</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger id="categoria">
                  <SelectValue placeholder="Selecciona una categoría…" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre del planograma</Label>
              <Input
                id="nombre"
                placeholder={
                  tiendaObj && categoriaObj
                    ? buildNombreDefault()
                    : "Se generará automáticamente…"
                }
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Si lo dejas vacío, se generará como "{categoriaObj?.nombre ?? "Categoría"} — {tiendaObj?.nombre ?? "Tienda"} — fecha"
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                disabled={!step0Valid}
                onClick={goNext}
                style={{ background: "var(--brand-magenta)", color: "#fff" }}
              >
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Configuración ───────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración de generación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Optimizar por */}
            <div className="space-y-2">
              <Label>Optimizar por</Label>
              <div className="flex gap-3 flex-wrap">
                {(
                  [
                    { value: "gmroi", label: "GMROI" },
                    { value: "margen", label: "Margen %" },
                    { value: "unidades", label: "Unidades" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOptimizarPor(opt.value)}
                    className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                    style={
                      optimizarPor === opt.value
                        ? { background: "var(--brand-magenta)", color: "#fff", borderColor: "var(--brand-magenta)" }
                        : { background: "transparent", borderColor: "var(--border)" }
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Agrupación */}
            <div className="space-y-2">
              <Label htmlFor="agrupacion">Agrupación</Label>
              <Select value={agrupacion} onValueChange={(v) => setAgrupacion(v as GenerateConfig["agrupacion"])}>
                <SelectTrigger id="agrupacion">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marca">Por marca</SelectItem>
                  <SelectItem value="subfamilia">Por subfamilia</SelectItem>
                  <SelectItem value="ninguna">Sin agrupar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Bandejas y posiciones */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="n_bandejas">Nº de bandejas</Label>
                <Input
                  id="n_bandejas"
                  type="number"
                  min={3}
                  max={8}
                  value={nBandejas}
                  onChange={(e) => setNBandejas(Math.min(8, Math.max(3, Number(e.target.value))))}
                />
                <p className="text-xs text-muted-foreground">Entre 3 y 8</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="n_posiciones">Posiciones por bandeja</Label>
                <Input
                  id="n_posiciones"
                  type="number"
                  min={10}
                  max={30}
                  value={nPosiciones}
                  onChange={(e) => setNPosiciones(Math.min(30, Math.max(10, Number(e.target.value))))}
                />
                <p className="text-xs text-muted-foreground">Entre 10 y 30</p>
              </div>
            </div>

            <Separator />

            {/* Incluir SKU C */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="incluir_sku_c" className="font-medium">
                  Incluir SKUs de baja rotación
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  GMROI &lt; 0.5× — categoría C
                </p>
              </div>
              <SwitchToggle
                id="incluir_sku_c"
                checked={incluirSkuC}
                onChange={setIncluirSkuC}
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Anterior
              </Button>
              <Button
                onClick={goNext}
                style={{ background: "var(--brand-magenta)", color: "#fff" }}
              >
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Generar ─────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa y generación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Summary of config */}
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tienda</span>
                <span className="font-medium">{tiendaObj?.nombre} — {tiendaObj?.ciudad}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Categoría</span>
                <span className="font-medium">{categoriaObj?.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre</span>
                <span className="font-medium truncate max-w-[280px] text-right">{nombre || buildNombreDefault()}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Optimizar por</span>
                <Badge variant="outline">{optimizarPor.toUpperCase()}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agrupación</span>
                <span>{agrupacion === "marca" ? "Por marca" : agrupacion === "subfamilia" ? "Por subfamilia" : "Sin agrupar"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estructura</span>
                <span>{nBandejas} bandejas × {nPosiciones} posiciones</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SKUs categoría C</span>
                <span>{incluirSkuC ? "Incluidos" : "Excluidos"}</span>
              </div>
            </div>

            {/* Error */}
            {genError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {genError}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: "var(--brand-magenta)" }}
                  />
                  <span className="text-sm font-medium">Planograma generado exitosamente</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Máximo {nBandejas * nPosiciones} SKUs asignados ({nBandejas}B × {nPosiciones}P).
                  Las bandejas 2 y 3 reciben los SKUs de mayor rendimiento (eye level).
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/planogramas/${result.planogramaId}/simulador`)}
                  >
                    Ver simulador
                  </Button>
                  <Button
                    size="sm"
                    style={{ background: "var(--brand-magenta)", color: "#fff" }}
                    onClick={() => router.push(`/planogramas/${result.planogramaId}/editor`)}
                  >
                    Editar manualmente
                  </Button>
                </div>
              </div>
            )}

            {!result && (
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={goBack} disabled={isPending}>
                  Anterior
                </Button>
                <Button
                  onClick={handleGenerar}
                  disabled={isPending}
                  style={{ background: "var(--brand-magenta)", color: "#fff" }}
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Generando…
                    </span>
                  ) : (
                    "Generar planograma"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
