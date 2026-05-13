"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  BookOpen,
  BarChart2,
  TrendingUp,
  DollarSign,
  Package,
  ShieldCheck,
  Layers,
  Store,
  LayoutGrid,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Eye,
  ShoppingCart,
  Smartphone,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

// ─── KPI Dictionary data ──────────────────────────────────────────────────────

type Semaforo = { label: string; color: string; bg: string; border: string; range: string }

type KpiEntry = {
  id: string
  nombre: string
  sigla?: string
  icon: React.ElementType
  iconColor: string
  formula: string
  formulaTex?: string
  descripcion: string
  para_que_sirve: string
  semaforos: Semaforo[]
  acciones: { estado: string; accion: string }[]
  ejemplo: string
  donde_ver: { label: string; href: string }[]
}

const KPIS: KpiEntry[] = [
  {
    id: "gmroi",
    nombre: "GMROI",
    sigla: "Gross Margin Return On Investment",
    icon: BarChart2,
    iconColor: "text-violet-600",
    formula: "Margen $ / Inventario promedio $ × 12",
    descripcion:
      "Mide cuántos pesos de margen genera cada peso invertido en inventario, anualizado. Es el KPI central de Category Management: combina rentabilidad y eficiencia de inventario en un solo número.",
    para_que_sirve:
      "Priorizar qué SKUs merecen más espacio en el estante. Un GMROI alto significa que el producto genera mucho margen con poco inventario inmovilizado.",
    semaforos: [
      { label: "Excelente", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "≥ 3.0×" },
      { label: "Bueno",     color: "text-green-700",   bg: "bg-green-50",   border: "border-green-200",   range: "2.0 – 2.9×" },
      { label: "Moderado",  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "1.0 – 1.9×" },
      { label: "Bajo",      color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "< 1.0×" },
    ],
    acciones: [
      { estado: "GMROI < 1.0×", accion: "Revisar precio o costo. Evaluar liquidación. Ver en Matriz de Cuadrantes." },
      { estado: "GMROI 1.0–2.0×", accion: "Mantener, buscar mejoras de costo o precio. Monitorear tendencia." },
      { estado: "GMROI ≥ 3.0×", accion: "Expandir espacio en planograma. Asegurar stock suficiente." },
    ],
    ejemplo:
      "Un SKU con margen mensual de $200.000 y stock promedio de $800.000 tiene GMROI = (200.000/800.000)×12 = 3.0×",
    donde_ver: [
      { label: "Dashboard → KPI Cards", href: "/dashboard" },
      { label: "Optimización → Matriz Cuadrantes", href: "/optimizacion" },
      { label: "Simulador de Planograma", href: "/planogramas" },
    ],
  },
  {
    id: "sellthru",
    nombre: "Sellthru",
    sigla: "Sell-Through Rate",
    icon: TrendingUp,
    iconColor: "text-blue-600",
    formula: "Unidades vendidas / Unidades recibidas × 100",
    descripcion:
      "Porcentaje de las unidades recibidas que efectivamente se vendieron en el período. Mide qué tan bien rotó el inventario.",
    para_que_sirve:
      "Detectar productos que se compran pero no se venden. Combinado con GMROI define el cuadrante del producto (Stars, Cash Cows, etc.).",
    semaforos: [
      { label: "Alto",     color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "≥ 65%" },
      { label: "Moderado", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "40 – 64%" },
      { label: "Bajo",     color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "< 40%" },
    ],
    acciones: [
      { estado: "Sellthru < 40%", accion: "Revisar visibilidad en planograma. Evaluar promotores/descuentos. Reducir próxima compra." },
      { estado: "Sellthru ≥ 65%", accion: "Asegurar reposición a tiempo. Aumentar profundidad de stock." },
    ],
    ejemplo:
      "Se recibieron 100 unidades, se vendieron 72 → Sellthru = 72%",
    donde_ver: [
      { label: "Dashboard → Sellthru", href: "/dashboard" },
      { label: "Simulador: capa Sellthru", href: "/planogramas" },
      { label: "Optimización → Matriz Cuadrantes (eje X)", href: "/optimizacion" },
    ],
  },
  {
    id: "mdi",
    nombre: "MDI",
    sigla: "Meses De Inventario",
    icon: Package,
    iconColor: "text-orange-600",
    formula: "Stock actual / Venta promedio mensual",
    descripcion:
      "Cuántos meses de ventas futuras puede cubrir el stock actual. Índice crítico para detectar sobrestock u obsolescencia.",
    para_que_sirve:
      "Gestionar órdenes de compra. Un MDI muy alto significa capital inmovilizado; muy bajo significa riesgo de quiebre.",
    semaforos: [
      { label: "Óptimo",          color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "1 – 3 meses" },
      { label: "Aceptable",       color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "3 – 6 meses" },
      { label: "Sobrestock",      color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200",  range: "6 – 12 meses" },
      { label: "Crítico/Obsoleto",color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "> 12 meses" },
    ],
    acciones: [
      { estado: "MDI < 1 mes",    accion: "Urgente: generar pedido de reposición. Ver Pedido Sugerido en planograma." },
      { estado: "MDI 6–12 meses", accion: "Reducir próxima orden. Evaluar promoción agresiva." },
      { estado: "MDI > 12 meses", accion: "Candidato a descontinuación. Evaluar liquidación." },
    ],
    ejemplo:
      "Stock actual: 150 unidades. Venta promedio: 30 unidades/mes → MDI = 5 meses",
    donde_ver: [
      { label: "SKUs → Vista MDI", href: "/skus" },
      { label: "Simulador: capa MDI", href: "/planogramas" },
      { label: "Alertas → Sobrestock / Obsoleto", href: "/alertas" },
    ],
  },
  {
    id: "fill-rate",
    nombre: "Fill Rate",
    sigla: "Tasa de Disponibilidad",
    icon: ShieldCheck,
    iconColor: "text-teal-600",
    formula: "Días con stock / Días totales del período × 100",
    descripcion:
      "Porcentaje de días en que el SKU tenía stock disponible para la venta. Detecta quiebres de stock que el sellthru no captura.",
    para_que_sirve:
      "Identificar SKUs que pierden ventas por falta de stock. Un fill rate bajo con buen sellthru indica que se vende todo lo que llega pero falta reposición.",
    semaforos: [
      { label: "Excelente", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "≥ 95%" },
      { label: "Bueno",     color: "text-green-700",   bg: "bg-green-50",   border: "border-green-200",   range: "85 – 94%" },
      { label: "Riesgo",    color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "70 – 84%" },
      { label: "Crítico",   color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "< 70%" },
    ],
    acciones: [
      { estado: "Fill Rate < 70%", accion: "Revisar ciclo de reposición. Aumentar stock de seguridad. Ver Pedido Sugerido." },
      { estado: "Fill Rate 70–85%", accion: "Monitorear semanalmente. Ajustar frecuencia de pedido." },
    ],
    ejemplo:
      "En 30 días, el SKU tuvo stock 27 días → Fill Rate = 90%",
    donde_ver: [
      { label: "Dashboard → Fill Rate", href: "/dashboard" },
      { label: "Alertas → Quiebre de stock inminente", href: "/alertas" },
    ],
  },
  {
    id: "s2s",
    nombre: "Sell-to-Stock",
    sigla: "S2S (Semanal)",
    icon: RefreshCw,
    iconColor: "text-indigo-600",
    formula: "Unidades vendidas semana / Stock inicio semana × 100",
    descripcion:
      "Ratio semanal de ventas sobre stock disponible. Mide la velocidad de rotación a corto plazo.",
    para_que_sirve:
      "Detectar quiebres inminentes (S2S muy alto, todo el stock se vende en días) o estancamiento (S2S muy bajo). Complementa el MDI con visión semanal.",
    semaforos: [
      { label: "Fluido",    color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "20 – 50%" },
      { label: "Rápido",    color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "> 50%" },
      { label: "Lento",     color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "< 10%" },
    ],
    acciones: [
      { estado: "S2S > 50%", accion: "Stock se agota en menos de 2 semanas. Generar pedido urgente." },
      { estado: "S2S < 10%", accion: "El producto no rota. Revisar ubicación en planograma, precio y visibilidad." },
    ],
    ejemplo:
      "Stock lunes: 40 uds. Ventas semana: 12 uds → S2S = 30%",
    donde_ver: [
      { label: "Dashboard → Sell-to-Stock", href: "/dashboard" },
    ],
  },
  {
    id: "margen",
    nombre: "Margen %",
    sigla: "Margen Bruto",
    icon: DollarSign,
    iconColor: "text-emerald-600",
    formula: "(Precio venta − Costo) / Precio venta × 100",
    descripcion:
      "Porcentaje de ganancia bruta sobre el precio de venta. Indica la rentabilidad intrínseca del producto, independiente del volumen.",
    para_que_sirve:
      "Comparar rentabilidad entre SKUs y categorías. SKUs con margen bajo necesitan mayor volumen para ser viables.",
    semaforos: [
      { label: "Excelente", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "≥ 45%" },
      { label: "Bueno",     color: "text-green-700",   bg: "bg-green-50",   border: "border-green-200",   range: "30 – 44%" },
      { label: "Moderado",  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "20 – 29%" },
      { label: "Bajo",      color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "< 20%" },
    ],
    acciones: [
      { estado: "Margen < 20%", accion: "Renegociar con proveedor o ajustar precio. Evaluar si el volumen compensa." },
      { estado: "Margen ≥ 45%", accion: "Priorizar en planograma. Asegurar visibilidad y stock." },
    ],
    ejemplo:
      "Precio $15.000, Costo $9.000 → Margen = (15.000−9.000)/15.000 = 40%",
    donde_ver: [
      { label: "Dashboard → Margen", href: "/dashboard" },
      { label: "SKUs → Tabla", href: "/skus" },
    ],
  },
  {
    id: "cuadrantes",
    nombre: "Matriz de Cuadrantes",
    sigla: "Stars / Cash Cows / Question Marks / Dogs",
    icon: Sparkles,
    iconColor: "text-pink-600",
    formula: "Eje X: Sellthru% · Eje Y: GMROI · Umbral: Sellthru 60%, GMROI 3×",
    descripcion:
      "Clasifica cada SKU en uno de 4 cuadrantes según su GMROI y Sellthru, adaptado del BCG Matrix al Category Management de retail.",
    para_que_sirve:
      "Decidir qué SKUs expandir, mantener, revisar o eliminar del surtido.",
    semaforos: [
      { label: "⭐ Stars",          color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", range: "Sellthru > 60% y GMROI > 3×" },
      { label: "🐄 Cash Cows",     color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200",    range: "Sellthru ≤ 60% y GMROI > 3×" },
      { label: "❓ Question Marks", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   range: "Sellthru > 60% y GMROI ≤ 3×" },
      { label: "🐕 Dogs",          color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    range: "Sellthru ≤ 60% y GMROI ≤ 3×" },
    ],
    acciones: [
      { estado: "Stars",          accion: "Expandir espacio en planograma. Prioridad máxima en reposición." },
      { estado: "Cash Cows",      accion: "Mantener espacio. Alta rentabilidad pero baja rotación → cuidar MDI." },
      { estado: "Question Marks", accion: "Investigar por qué no rentabiliza. ¿Precio alto? ¿Costo alto?" },
      { estado: "Dogs",           accion: "Reducir espacio o eliminar. Son candidatos a liquidación." },
    ],
    ejemplo:
      "Un labial con Sellthru 75% y GMROI 4.2× es una Star → expandir.",
    donde_ver: [
      { label: "Optimización → Matriz Cuadrantes", href: "/optimizacion" },
    ],
  },
]

// ─── Manual sections ──────────────────────────────────────────────────────────

type ManualSection = {
  icon: React.ElementType
  color: string
  title: string
  subtitle: string
  href: string
  steps: string[]
  tip?: string
}

const MANUAL_SECTIONS: ManualSection[] = [
  {
    icon: BarChart2,
    color: "text-violet-600",
    title: "Dashboard",
    subtitle: "Vista ejecutiva de KPIs",
    href: "/dashboard",
    steps: [
      "Selecciona el período (3m, 6m, 12m, 24m) y los filtros de tienda/categoría/marca.",
      "Lee los KPI Cards en la barra superior: GMROI, Sellthru, Margen, Fill Rate, etc.",
      "Revisa las Alertas accionables — aparecen colapsadas si no hay problemas.",
      "Explora las pestañas: Ejecutivo (resumen), Tendencia (evolución 24m), Top/Bottom SKUs, Heatmap.",
      "El heatmap Categoría × Tienda permite identificar combinaciones críticas de bajo GMROI.",
    ],
    tip: "El período afecta todos los cálculos. Para análisis anuales usa 12m; para tendencias recientes usa 3m.",
  },
  {
    icon: Package,
    color: "text-blue-600",
    title: "SKUs",
    subtitle: "Análisis por producto",
    href: "/skus",
    steps: [
      "Usa la tabla para ordenar y filtrar por cualquier columna (GMROI, Sellthru, MDI, etc.).",
      "Haz click en cualquier fila para ver el detalle del SKU con KPIs históricos.",
      "Cambia a Vista MDI para ver los SKUs coloreados por inventario (verde=sano, rojo=obsoleto).",
      "Usa los filtros de marca/categoría/MDI para segmentar el análisis.",
      "Exporta la lista filtrada a CSV para compartir con el equipo de compras.",
    ],
    tip: "Ordena por MDI descendente para encontrar rápidamente los productos con más inventario inmovilizado.",
  },
  {
    icon: Layers,
    color: "text-teal-600",
    title: "Categorías",
    subtitle: "Análisis por familia de producto",
    href: "/categorias",
    steps: [
      "Haz click en una categoría para ver su detalle con KPIs agregados.",
      "La pestaña Tendencias muestra la evolución de atributos (tono, formato) en el tiempo.",
      "Compara el desempeño entre subfamilias para detectar las más rentables.",
      "Identifica los SKUs líderes y los que están por debajo del promedio de la categoría.",
    ],
  },
  {
    icon: Store,
    color: "text-orange-600",
    title: "Tiendas",
    subtitle: "Análisis por punto de venta",
    href: "/tiendas",
    steps: [
      "Selecciona una tienda para ver su dashboard específico.",
      "Compara los KPIs de la tienda contra el benchmark de tiendas del mismo formato.",
      "Identifica las categorías con bajo desempeño en esa tienda.",
      "Usa los datos para priorizar qué planograma asignar.",
    ],
  },
  {
    icon: LayoutGrid,
    color: "text-pink-600",
    title: "Planogramas",
    subtitle: "Gestión visual del estante",
    href: "/planogramas",
    steps: [
      "Crear nuevo: usa el wizard de 3 pasos (Tienda → Configuración → Vista previa). El algoritmo ordena los SKUs por GMROI.",
      "Simulador: visualiza el estante con heat map de GMROI. Cambia la capa (GMROI/Sellthru/MDI/Ingreso) para distintas vistas.",
      "Swap: haz click en cualquier slot para ver candidatos de reemplazo con Δ GMROI y Δ Ingreso.",
      "Editor: arrastra y suelta SKUs para ajustar el layout manualmente.",
      "Vista móvil (QR): genera un QR para que el personal de tienda arme el estante con su celular.",
      "Pedido sugerido: genera automáticamente el listado de productos a reponer para 10 semanas de cobertura.",
      "Asignar tiendas: el botón 'Tiendas' en el simulador permite asignar el planograma a múltiples locales.",
    ],
    tip: "El eye level (bandejas 2 y 3) tiene el mayor impacto en ventas. El algoritmo coloca automáticamente los SKUs con mayor GMROI en esas bandejas.",
  },
  {
    icon: Sparkles,
    color: "text-indigo-600",
    title: "Optimización",
    subtitle: "Análisis estratégico de surtido",
    href: "/optimizacion",
    steps: [
      "Matriz de Cuadrantes: visualiza todos los SKUs en el mapa GMROI × Sellthru.",
      "Haz click en un punto para ver el detalle del SKU (nombre, marca, todos sus KPIs).",
      "Usa el filtro de categoría para analizar una familia específica.",
      "Lee las Recomendaciones automáticas debajo del gráfico.",
      "Pestaña Órdenes de compra: lista de SKUs con stock insuficiente y cantidad sugerida a pedir.",
    ],
  },
  {
    icon: Eye,
    color: "text-amber-600",
    title: "Espacio por Marca",
    subtitle: "Distribución óptima del lineal",
    href: "/optimizacion/espacio-marca",
    steps: [
      "Compara el espacio actual de cada marca (slots en planograma) vs. su participación en ventas.",
      "La columna Δ muestra si la marca debería tener más (+) o menos (−) espacio.",
      "El algoritmo calcula el espacio óptimo ponderando GMROI × participación en ventas.",
      "Exporta el análisis en CSV para presentarlo en reuniones con marcas.",
    ],
    tip: "Si una marca tiene 20% del espacio pero solo 8% de las ventas con GMROI bajo, es candidata a reducción.",
  },
  {
    icon: TrendingUp,
    color: "text-green-600",
    title: "Tendencias",
    subtitle: "Evolución de atributos de producto",
    href: "/tendencias",
    steps: [
      "Selecciona una categoría y un atributo (tono, formato, textura, etc.).",
      "El gráfico muestra cómo evoluciona la participación de cada valor del atributo en el tiempo.",
      "El panel de Insights detecta automáticamente atributos en alza o baja (últimos 6m).",
      "Usa estos insights para planear futuras compras y ajustar el mix.",
    ],
    tip: "Busca atributos con pendiente positiva para priorizar en próximas órdenes de compra.",
  },
  {
    icon: AlertTriangle,
    color: "text-rose-600",
    title: "Alertas",
    subtitle: "Acciones prioritarias",
    href: "/alertas",
    steps: [
      "Las alertas se clasifican en 4 tipos: Dog (bajo GMROI), Sobrestock, Quiebre inminente, Obsoleto.",
      "Filtra por tipo o severidad para enfocarte en lo más urgente.",
      "Alta prioridad (rojo) requiere acción inmediata.",
      "Exporta las alertas filtradas a CSV para asignar acciones al equipo.",
      "Las alertas se recalculan con los KPIs de los últimos 6 meses.",
    ],
    tip: "Trabaja siempre de arriba hacia abajo: resuelve primero las alertas de Alta prioridad.",
  },
  {
    icon: Smartphone,
    color: "text-cyan-600",
    title: "Vista Móvil (Staff de tienda)",
    subtitle: "Armar el planograma en tienda",
    href: "/planogramas",
    steps: [
      "En cualquier planograma, haz click en el ícono QR del encabezado.",
      "Muestra el código QR al staff de la tienda o cópialo.",
      "El staff escanea el QR con su celular y ve la lista de productos por bandeja.",
      "Pueden marcar cada producto como colocado (checklist táctil).",
      "Al completar todos los productos aparece el banner '¡Listo!'.",
    ],
  },
  {
    icon: ShoppingCart,
    color: "text-teal-600",
    title: "Pedido Sugerido",
    subtitle: "Orden de compra automática",
    href: "/planogramas",
    steps: [
      "Entra a cualquier planograma y haz click en el botón 'Pedido'.",
      "El sistema calcula automáticamente las unidades a pedir para cubrir 10 semanas.",
      "Selecciona/deselecciona SKUs para incluir en la orden.",
      "Urgencia: rojo = sin stock, amarillo = stock bajo.",
      "Exporta a CSV para enviar al proveedor.",
    ],
    tip: "Fórmula: Unidades a pedir = max(0, Venta mensual × 10/4 − Stock actual). Target = 10 semanas de cobertura.",
  },
]

// ─── Components ───────────────────────────────────────────────────────────────

function SemaforoChip({ s }: { s: Semaforo }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 flex items-start gap-2", s.bg, s.border)}>
      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0",
        s.bg.includes("emerald") ? "bg-emerald-500"
        : s.bg.includes("green")   ? "bg-green-500"
        : s.bg.includes("amber")   ? "bg-amber-500"
        : s.bg.includes("orange")  ? "bg-orange-500"
        : s.bg.includes("blue")    ? "bg-blue-500"
        : s.bg.includes("indigo")  ? "bg-indigo-500"
        : "bg-rose-500"
      )} />
      <div>
        <p className={cn("text-xs font-semibold", s.color)}>{s.label}</p>
        <p className="text-xs text-muted-foreground">{s.range}</p>
      </div>
    </div>
  )
}

function KpiCard({ kpi, active, onClick }: { kpi: KpiEntry; active: boolean; onClick: () => void }) {
  const Icon = kpi.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-all hover:shadow-md w-full",
        active
          ? "border-[oklch(0.62_0.20_358)] bg-[oklch(0.97_0.01_358)] shadow-md"
          : "bg-card hover:border-muted-foreground/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          active ? "bg-[oklch(0.62_0.20_358/0.12)]" : "bg-muted"
        )}>
          <Icon className={cn("h-4.5 w-4.5", kpi.iconColor)} style={{ height: "1.125rem", width: "1.125rem" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold text-sm", active && "text-[var(--brand-magenta)]")}>{kpi.nombre}</p>
          {kpi.sigla && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{kpi.sigla}</p>}
        </div>
        {active && <ArrowRight className="h-4 w-4 text-[var(--brand-magenta)] shrink-0 mt-0.5" />}
      </div>
    </button>
  )
}

function KpiDetail({ kpi }: { kpi: KpiEntry }) {
  const Icon = kpi.icon
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Icon className={cn("h-6 w-6", kpi.iconColor)} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{kpi.nombre}</h2>
          </div>
          {kpi.sigla && (
            <p className="text-sm text-muted-foreground">{kpi.sigla}</p>
          )}
        </div>
      </div>

      {/* Fórmula */}
      <div className="rounded-xl bg-muted/60 border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Fórmula</p>
        <code className="text-sm font-mono font-semibold text-foreground">{kpi.formula}</code>
      </div>

      {/* Descripción */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">¿Qué mide?</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{kpi.descripcion}</p>
      </div>

      {/* Para qué sirve */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">¿Para qué sirve?</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{kpi.para_que_sirve}</p>
      </div>

      {/* Semáforo */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Semáforo de rangos</p>
        <div className="grid grid-cols-2 gap-2">
          {kpi.semaforos.map(s => <SemaforoChip key={s.label} s={s} />)}
        </div>
      </div>

      {/* Acciones */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Acciones recomendadas</p>
        <div className="space-y-2">
          {kpi.acciones.map(a => (
            <div key={a.estado} className="flex gap-3 rounded-lg border bg-card p-3">
              <Badge variant="outline" className="text-xs shrink-0 h-fit mt-0.5">
                {a.estado}
              </Badge>
              <p className="text-sm text-muted-foreground leading-snug">{a.accion}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ejemplo */}
      <div className="rounded-xl border-l-4 border-l-[var(--brand-magenta)] bg-[oklch(0.97_0.01_358)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--brand-magenta)] mb-1">Ejemplo práctico</p>
        <p className="text-sm text-muted-foreground">{kpi.ejemplo}</p>
      </div>

      {/* Dónde ver */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Dónde verlo en la app</p>
        <div className="flex flex-wrap gap-2">
          {kpi.donde_ver.map(d => (
            <Link
              key={d.href + d.label}
              href={d.href}
              className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:border-[oklch(0.62_0.20_358)] hover:text-[var(--brand-magenta)] transition-colors"
            >
              {d.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function ManualSectionCard({ section }: { section: ManualSection }) {
  const Icon = section.icon
  const [open, setOpen] = useState(false)

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-all",
      open && "shadow-md border-[oklch(0.62_0.20_358/0.4)]"
    )}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Icon className={cn("h-5 w-5", section.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{section.title}</p>
          <p className="text-xs text-muted-foreground">{section.subtitle}</p>
        </div>
        <div className={cn("transition-transform", open && "rotate-90")}>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t">
          {/* Steps */}
          <ol className="space-y-2.5 mt-3">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[oklch(0.62_0.20_358/0.12)] text-[10px] font-bold text-[var(--brand-magenta)] mt-0.5">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-snug">{step}</span>
              </li>
            ))}
          </ol>

          {/* Tip */}
          {section.tip && (
            <div className="rounded-lg border-l-4 border-l-amber-400 bg-amber-50 px-4 py-2.5">
              <p className="text-xs font-semibold text-amber-700 mb-0.5">💡 Tip</p>
              <p className="text-xs text-amber-800 leading-snug">{section.tip}</p>
            </div>
          )}

          {/* Link to section */}
          <Link
            href={section.href}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand-magenta)] hover:opacity-80 transition-opacity"
          >
            Ir a {section.title} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ManualClient() {
  const [activeTab, setActiveTab]   = useState<"manual" | "indicadores">("manual")
  const [selectedKpi, setSelectedKpi] = useState<string>(KPIS[0].id)

  const kpi = KPIS.find(k => k.id === selectedKpi) ?? KPIS[0]

  return (
    <div className="space-y-0">
      {/* ── Hero header ────────────────────────────────────────────────── */}
      <div
        className="px-6 py-8"
        style={{ background: "linear-gradient(135deg, oklch(0.22 0.05 358) 0%, oklch(0.18 0.08 290) 100%)" }}
      >
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center shrink-0">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Manual & Indicadores</h1>
            <p className="text-sm text-white/70 mt-0.5">
              Guía de uso de la plataforma y diccionario de KPIs de Category Management
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 bg-white/10 rounded-xl p-1 w-fit">
          {(["manual", "indicadores"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-white text-gray-900 shadow"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
            >
              {tab === "manual" ? "🚀 Cómo usar" : "📖 Diccionario de Indicadores"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="p-5 sm:p-6">

        {/* ── TAB: MANUAL ──────────────────────────────────────────────── */}
        {activeTab === "manual" && (
          <div className="max-w-3xl space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Haz click en cada módulo para ver los pasos de uso.
            </p>
            {MANUAL_SECTIONS.map(section => (
              <ManualSectionCard key={section.title} section={section} />
            ))}

            {/* Flujo sugerido */}
            <div className="rounded-xl border bg-card p-5 mt-6 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                🗺️ Flujo de trabajo semanal sugerido
              </h3>
              <ol className="space-y-2">
                {[
                  { n: "1", text: "Dashboard → revisar KPI Cards y Alertas. ¿Hay alertas rojas?", link: "/dashboard" },
                  { n: "2", text: "Alertas → actuar sobre Dog/Sobrestock/Quiebre según severidad.", link: "/alertas" },
                  { n: "3", text: "Optimización → Matriz Cuadrantes → identificar Dogs que salen del mix.", link: "/optimizacion" },
                  { n: "4", text: "Planogramas → Simulador → swapear Dogs por Question Marks con mejor GMROI.", link: "/planogramas" },
                  { n: "5", text: "Pedido → generar orden de compra para los SKUs críticos (MDI < 1m).", link: "/planogramas" },
                  { n: "6", text: "Tendencias → revisar atributos en alza para próximas compras.", link: "/tendencias" },
                ].map(step => (
                  <li key={step.n} className="flex items-start gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-magenta)] text-white text-xs font-bold mt-0.5">
                      {step.n}
                    </span>
                    <span className="text-muted-foreground flex-1 leading-snug pt-0.5">{step.text}</span>
                    <Link href={step.link} className="text-[var(--brand-magenta)] hover:opacity-80 shrink-0 mt-0.5">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ── TAB: INDICADORES ─────────────────────────────────────────── */}
        {activeTab === "indicadores" && (
          <div className="flex gap-6 items-start">

            {/* Sidebar: KPI list */}
            <div className="w-52 shrink-0 space-y-1.5 hidden md:block sticky top-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1 mb-3">
                Indicadores
              </p>
              {KPIS.map(k => (
                <KpiCard
                  key={k.id}
                  kpi={k}
                  active={selectedKpi === k.id}
                  onClick={() => setSelectedKpi(k.id)}
                />
              ))}
            </div>

            {/* Mobile selector */}
            <div className="md:hidden w-full mb-4">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {KPIS.map(k => {
                  const Icon = k.icon
                  return (
                    <button
                      key={k.id}
                      onClick={() => setSelectedKpi(k.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shrink-0 transition-all",
                        selectedKpi === k.id
                          ? "bg-[var(--brand-magenta)] text-white border-[var(--brand-magenta)]"
                          : "bg-card hover:border-muted-foreground/40"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {k.nombre}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0 rounded-xl border bg-card p-6">
              <KpiDetail kpi={kpi} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
