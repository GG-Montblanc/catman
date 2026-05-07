/**
 * Holt-Winters Triple Exponential Smoothing — implementación TypeScript pura.
 * Modelo aditivo con estacionalidad de periodo configurable (default 12 meses).
 *
 * Degradación automática:
 *   series.length < 4               → forecast plano (promedio)
 *   series.length < seasonLength*2  → Holt simple (nivel + tendencia, sin estacionalidad)
 *   serie completa                  → Holt-Winters aditivo
 */

export type HoltWintersResult = {
  fitted: number[]     // valores ajustados al histórico (mismo largo que series)
  forecast: number[]   // pronóstico N períodos hacia adelante
  alpha: number        // nivel
  beta: number         // tendencia
  gamma: number        // estacionalidad
  mape: number         // Mean Absolute Percentage Error sobre últimos min(6, n/3) puntos
}

export type HoltWintersOptions = {
  alpha?: number        // 0–1, si se omite se auto-optimiza
  beta?: number         // 0–1, si se omite se auto-optimiza
  gamma?: number        // 0–1, si se omite se auto-optimiza
  seasonLength?: number // default 12
  horizon?: number      // períodos a pronosticar, default 6
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Calcula SSE del modelo con los parámetros dados para selección por grid search */
function computeSSE(
  series: number[],
  alpha: number,
  beta: number,
  gamma: number,
  seasonLength: number,
  mode: "holt" | "hw"
): number {
  const n = series.length
  let sse = 0

  if (mode === "holt") {
    // Holt simple: nivel + tendencia
    let L = series[0]
    let T = (series[Math.min(1, n - 1)] - series[0]) || 0
    for (let t = 1; t < n; t++) {
      const yhat = L + T
      const err = series[t] - yhat
      sse += err * err
      const Lprev = L
      L = alpha * series[t] + (1 - alpha) * (L + T)
      T = beta * (L - Lprev) + (1 - beta) * T
    }
  } else {
    // Holt-Winters aditivo
    const m = seasonLength
    const L0 = mean(series.slice(0, m))
    const T0 = (mean(series.slice(m, 2 * m)) - L0) / m || 0
    const S: number[] = []
    for (let i = 0; i < m; i++) {
      S.push(L0 > 0 ? series[i] / L0 : 0)
    }

    let L = L0
    let Tv = T0
    const seasonal = [...S]

    for (let t = 0; t < n; t++) {
      const si = t % m
      if (t < m) {
        // warm-up: no contabilizar como error de forecast
        const Lprev = L
        L = alpha * (series[t] - seasonal[si]) + (1 - alpha) * (L + Tv)
        Tv = beta * (L - Lprev) + (1 - beta) * Tv
        seasonal[si] = gamma * (series[t] - Lprev - Tv) + (1 - gamma) * seasonal[si]
      } else {
        const yhat = L + Tv + seasonal[si]
        const err = series[t] - yhat
        sse += err * err
        const Lprev = L
        L = alpha * (series[t] - seasonal[si]) + (1 - alpha) * (L + Tv)
        Tv = beta * (L - Lprev) + (1 - beta) * Tv
        seasonal[si] = gamma * (series[t] - Lprev - Tv) + (1 - gamma) * seasonal[si]
      }
    }
  }

  return sse
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

export function holtWinters(
  series: number[],
  options?: HoltWintersOptions
): HoltWintersResult {
  const horizon = options?.horizon ?? 6
  const seasonLength = options?.seasonLength ?? 12
  const n = series.length

  // ── Caso degenerado: serie muy corta ──────────────────────────────────────
  if (n < 4) {
    const avg = n > 0 ? mean(series) : 0
    const fitted = series.map(() => avg)
    const forecast = Array(horizon).fill(avg)
    // MAPE: evitar división por cero
    const validPairs = series.map((v, i) => ({ v, f: fitted[i] }))
      .filter(({ v }) => Math.abs(v) > 1e-9)
    const mape = validPairs.length > 0
      ? mean(validPairs.map(({ v, f }) => Math.abs((v - f) / v) * 100))
      : 0
    return { fitted, forecast, alpha: 0.3, beta: 0.1, gamma: 0, mape }
  }

  // ── Modo: Holt simple vs Holt-Winters ────────────────────────────────────
  const mode: "holt" | "hw" = n < seasonLength * 2 ? "holt" : "hw"

  // ── Grid search de parámetros (3³ = 27 combinaciones máx) ────────────────
  const GRID = [0.1, 0.3, 0.6] as const
  let bestAlpha = options?.alpha ?? 0.3
  let bestBeta  = options?.beta  ?? 0.1
  let bestGamma = options?.gamma ?? 0.1
  let bestSSE   = Infinity

  if (options?.alpha === undefined || options?.beta === undefined || options?.gamma === undefined) {
    for (const a of GRID) {
      for (const b of GRID) {
        for (const g of GRID) {
          const alpha = options?.alpha ?? a
          const beta  = options?.beta  ?? b
          const gamma = options?.gamma ?? g
          const sse = computeSSE(series, alpha, beta, gamma, seasonLength, mode)
          if (sse < bestSSE) {
            bestSSE = sse
            bestAlpha = alpha
            bestBeta  = beta
            bestGamma = gamma
          }
        }
      }
    }
  }

  // ── Ajuste final con parámetros óptimos ──────────────────────────────────
  const alpha = clamp(bestAlpha, 0, 1)
  const beta  = clamp(bestBeta,  0, 1)
  const gamma = clamp(bestGamma, 0, 1)

  const fitted  = new Array<number>(n)
  const forecast = new Array<number>(horizon)

  if (mode === "holt") {
    // Holt simple (sin estacionalidad)
    let L = series[0]
    let T = n > 1 ? (series[1] - series[0]) : 0
    fitted[0] = L

    for (let t = 1; t < n; t++) {
      const yhat = L + T
      fitted[t] = yhat
      const Lprev = L
      L = alpha * series[t] + (1 - alpha) * (L + T)
      T = beta * (L - Lprev) + (1 - beta) * T
    }
    for (let h = 1; h <= horizon; h++) {
      forecast[h - 1] = Math.max(0, L + T * h)
    }
  } else {
    // Holt-Winters aditivo
    const m = seasonLength
    const L0 = mean(series.slice(0, m))
    const T0 = (mean(series.slice(m, 2 * m)) - L0) / m || 0

    // Índices estacionales iniciales
    const seasonal = new Array<number>(m)
    for (let i = 0; i < m; i++) {
      seasonal[i] = L0 > 0 ? (series[i] - L0) : 0
    }

    let L = L0
    let Tv = T0

    // Fase de warm-up (primera temporada) — sin contabilizar fitted
    for (let t = 0; t < m; t++) {
      const si = t % m
      fitted[t] = L + Tv + seasonal[si]
      const Lprev = L
      L = alpha * (series[t] - seasonal[si]) + (1 - alpha) * (L + Tv)
      Tv = beta * (L - Lprev) + (1 - beta) * Tv
      seasonal[si] = gamma * (series[t] - Lprev - Tv) + (1 - gamma) * seasonal[si]
    }

    // Segunda temporada en adelante
    for (let t = m; t < n; t++) {
      const si = t % m
      const yhat = L + Tv + seasonal[si]
      fitted[t] = yhat
      const Lprev = L
      L = alpha * (series[t] - seasonal[si]) + (1 - alpha) * (L + Tv)
      Tv = beta * (L - Lprev) + (1 - beta) * Tv
      seasonal[si] = gamma * (series[t] - Lprev - Tv) + (1 - gamma) * seasonal[si]
    }

    // Pronóstico h pasos adelante
    for (let h = 1; h <= horizon; h++) {
      const si = (n + h - 1) % m
      forecast[h - 1] = Math.max(0, L + Tv * h + seasonal[si])
    }
  }

  // ── MAPE sobre los últimos min(6, n/3) puntos del fitted ──────────────────
  const mapeWindow = Math.max(1, Math.min(6, Math.floor(n / 3)))
  const mapeSlice  = series.slice(n - mapeWindow)
  const fittedSlice = fitted.slice(n - mapeWindow)
  const validPairs  = mapeSlice
    .map((v, i) => ({ v, f: fittedSlice[i] }))
    .filter(({ v }) => Math.abs(v) > 1e-9)
  const mape = validPairs.length > 0
    ? mean(validPairs.map(({ v, f }) => Math.abs((v - f) / v) * 100))
    : 0

  return {
    fitted,
    forecast,
    alpha,
    beta,
    gamma: mode === "holt" ? 0 : gamma,
    mape: Math.round(mape * 100) / 100,
  }
}
