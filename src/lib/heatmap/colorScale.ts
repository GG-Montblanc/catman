// Color scale for shelf heatmap cells
// Returns CSS color string (oklch) based on metric value and range

export type HeatmapLayer = "gmroi" | "sellthru" | "mdi" | "ingreso"

type ColorStop = { v: number; l: number; c: number; h: number }

// Interpolate between color stops
function interpolate(stops: ColorStop[], value: number): string {
  if (stops.length === 0) return "oklch(0.92 0 0)"
  if (value <= stops[0].v)    return `oklch(${stops[0].l} ${stops[0].c} ${stops[0].h})`
  if (value >= stops[stops.length - 1].v) {
    const s = stops[stops.length - 1]
    return `oklch(${s.l} ${s.c} ${s.h})`
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    if (value >= a.v && value <= b.v) {
      const t = (value - a.v) / (b.v - a.v)
      const l = a.l + (b.l - a.l) * t
      const c = a.c + (b.c - a.c) * t
      const h = a.h + (b.h - a.h) * t
      return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`
    }
  }
  return "oklch(0.92 0 0)"
}

// GMROI: red (0) → yellow (1.4) → green (2.6+)
const GMROI_STOPS: ColorStop[] = [
  { v: 0,   l: 0.70, c: 0.13, h: 25   },  // red
  { v: 1.4, l: 0.78, c: 0.14, h: 75   },  // yellow
  { v: 2.6, l: 0.60, c: 0.16, h: 142  },  // green
  { v: 5.0, l: 0.48, c: 0.18, h: 142  },  // deep green
]

// Sellthru: red (0%) → yellow (40%) → green (70%+)
const SELLTHRU_STOPS: ColorStop[] = [
  { v: 0,   l: 0.70, c: 0.13, h: 25  },
  { v: 40,  l: 0.78, c: 0.14, h: 75  },
  { v: 70,  l: 0.60, c: 0.16, h: 142 },
  { v: 100, l: 0.48, c: 0.18, h: 142 },
]

// MDI: inverse — low MDI (healthy) = green, high MDI (obsolete) = red
const MDI_STOPS: ColorStop[] = [
  { v: 0,  l: 0.48, c: 0.18, h: 142 },  // deep green
  { v: 3,  l: 0.60, c: 0.16, h: 142 },  // green
  { v: 6,  l: 0.78, c: 0.14, h: 75  },  // yellow
  { v: 12, l: 0.70, c: 0.13, h: 25  },  // red
  { v: 36, l: 0.58, c: 0.20, h: 20  },  // deep red
]

// Ingreso (relative, normalized 0–1)
const INGRESO_STOPS: ColorStop[] = [
  { v: 0,    l: 0.92, c: 0, h: 0    },  // gray (no ingreso)
  { v: 0.05, l: 0.78, c: 0.08, h: 198 }, // light teal
  { v: 0.3,  l: 0.65, c: 0.12, h: 198 }, // teal
  { v: 1.0,  l: 0.48, c: 0.15, h: 198 }, // deep teal
]

export function slotColor(
  layer: HeatmapLayer,
  value: number | null | undefined,
  maxIngreso?: number
): string {
  if (value == null) return "oklch(0.92 0 0)"

  switch (layer) {
    case "gmroi":    return interpolate(GMROI_STOPS,    value)
    case "sellthru": return interpolate(SELLTHRU_STOPS, value)
    case "mdi":      return interpolate(MDI_STOPS,      value)
    case "ingreso": {
      const norm = maxIngreso ? Math.min(value / maxIngreso, 1) : 0
      return interpolate(INGRESO_STOPS, norm)
    }
  }
}

export function layerValue(
  layer: HeatmapLayer,
  kpis: {
    avg_gmroi?: number | null
    avg_sellthru?: number | null
    avg_mdi?: number | null
    total_ingreso?: number | null
  } | null
): number | null {
  if (!kpis) return null
  switch (layer) {
    case "gmroi":    return kpis.avg_gmroi    ?? null
    case "sellthru": return kpis.avg_sellthru ?? null
    case "mdi":      return kpis.avg_mdi      ?? null
    case "ingreso":  return kpis.total_ingreso ?? null
  }
}
