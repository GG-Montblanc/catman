/**
 * Croston / SBA (Syntetos-Boylan Approximation) — forecasting para demanda
 * intermitente y lumpy, donde Holt-Winters no aplica bien (la serie tiene
 * demasiados ceros; un modelo de nivel+tendencia+estacionalidad sobreajusta
 * ruido y puede dar MAPE altísimos o pronósticos poco confiables).
 *
 * Idea: en vez de suavizar la serie completa (con ceros), Croston separa
 * dos señales y las suaviza por separado:
 *   - tamaño de la demanda cuando SÍ hay venta (z)
 *   - intervalo entre ventas (p)
 * y el pronóstico es la tasa z/p (demanda promedio por período).
 * SBA corrige el sesgo positivo conocido de Croston clásico multiplicando
 * por (1 - alpha/2).
 *
 * El pronóstico resultante es una tasa constante por período (no tiene
 * sentido proyectar tendencia/estacionalidad sobre datos tan esporádicos),
 * que es exactamente lo que se necesita para calcular punto de reorden.
 */

export type CrostonResult = {
  forecast: number[]
  mape: number
  tasaPromedio: number
}

export function crostonSBA(
  series: number[],
  options?: { alpha?: number; horizon?: number }
): CrostonResult {
  const alpha = options?.alpha ?? 0.1
  const horizon = options?.horizon ?? 6

  let z: number | null = null
  let p: number | null = null
  let intervalo = 0

  for (const v of series) {
    intervalo++
    if (v > 0) {
      if (z === null || p === null) {
        z = v
        p = intervalo
      } else {
        z = alpha * v + (1 - alpha) * z
        p = alpha * intervalo + (1 - alpha) * p
      }
      intervalo = 0
    }
  }

  const tasaPromedio = z !== null && p ? Math.max(0, (1 - alpha / 2) * (z / p)) : 0
  const forecast = Array(horizon).fill(Math.round(tasaPromedio * 100) / 100)

  // MAPE clásico no es informativo con tantos ceros (siempre ~100%+);
  // en su lugar no se reporta (0 = "no aplica", el UI lo oculta).
  return { forecast, mape: 0, tasaPromedio }
}
