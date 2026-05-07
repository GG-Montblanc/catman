-- 0040_forecast.sql — Phase 4: Forecasting + Optimización de inventario
-- Tabla cache de pronósticos + RPCs para cuadrante GMROI/Sellthru y compras sugeridas

-- ============================================================================
-- TABLA: forecast_sku
-- Cache de pronósticos calculados por el motor Holt-Winters (TypeScript)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.forecast_sku (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id             UUID        NOT NULL REFERENCES public.skus(id)    ON DELETE CASCADE,
  tienda_id          UUID                 REFERENCES public.tiendas(id) ON DELETE CASCADE,
  calculado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anio_mes_inicio    DATE        NOT NULL,  -- primer mes del forecast
  forecast_json      JSONB       NOT NULL,  -- {unidades: [], ingreso: [], mape: number}
  tendencia          TEXT        NOT NULL CHECK (tendencia IN ('creciente','estable','decreciente')),
  alerta             TEXT        NOT NULL CHECK (alerta IN ('ok','quiebre_riesgo','sobrestock')),
  unidades_sugeridas INT         NOT NULL DEFAULT 0,
  UNIQUE (sku_id, tienda_id, anio_mes_inicio)
);

CREATE INDEX IF NOT EXISTS idx_forecast_sku_id
  ON public.forecast_sku (sku_id);
CREATE INDEX IF NOT EXISTS idx_forecast_tienda_id
  ON public.forecast_sku (tienda_id);
CREATE INDEX IF NOT EXISTS idx_forecast_alerta
  ON public.forecast_sku (alerta)
  WHERE alerta <> 'ok';
CREATE INDEX IF NOT EXISTS idx_forecast_calculado
  ON public.forecast_sku (calculado_at DESC);

-- RLS: los usuarios autenticados pueden leer; solo service role puede escribir
ALTER TABLE public.forecast_sku ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forecast_sku' AND policyname = 'forecast_sku_select'
  ) THEN
    CREATE POLICY forecast_sku_select
      ON public.forecast_sku FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- RPC: get_optimizacion_cuadrante
-- Matriz GMROI × Sell-through por SKU — base del quadrant chart de Phase 4
-- Filtrable por categoría (y descendientes) y tienda.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_optimizacion_cuadrante(
  p_categoria_id UUID DEFAULT NULL,
  p_tienda_id    UUID DEFAULT NULL,
  p_meses        INT  DEFAULT 6
)
RETURNS TABLE (
  sku_id          UUID,
  nombre          TEXT,
  marca_nombre    TEXT,
  categoria_nombre TEXT,
  avg_gmroi       NUMERIC,
  avg_sellthru    NUMERIC,
  total_ingreso   NUMERIC,
  total_unidades  BIGINT,
  mdi_actual      NUMERIC,
  imagen_url      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH periodo AS (
    SELECT
      (DATE_TRUNC('month', CURRENT_DATE) - (p_meses || ' months')::INTERVAL)::DATE AS desde,
      (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE                AS hasta
  ),
  -- último mes disponible por SKU (para MDI actual)
  ultimo_inventario AS (
    SELECT DISTINCT ON (i.sku_id)
      i.sku_id,
      i.mdi_meses
    FROM public.inventario_fact i
    ORDER BY i.sku_id, i.anio_mes DESC
  )
  SELECT
    s.id                                                                            AS sku_id,
    s.nombre                                                                        AS nombre,
    mar.nombre                                                                      AS marca_nombre,
    cat.nombre                                                                      AS categoria_nombre,
    ROUND(
      AVG(m.gmroi) FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2
    )                                                                               AS avg_gmroi,
    ROUND(
      AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2
    )                                                                               AS avg_sellthru,
    ROUND(SUM(m.ingreso), 2)                                                        AS total_ingreso,
    SUM(m.unidades)                                                                 AS total_unidades,
    COALESCE(ui.mdi_meses, 0)                                                       AS mdi_actual,
    s.imagen_url                                                                    AS imagen_url
  FROM public.mv_sku_kpis_mensual m
  JOIN public.skus            s   ON s.id   = m.sku_id
  LEFT JOIN public.marcas     mar ON mar.id = s.marca_id
  LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
  LEFT JOIN ultimo_inventario ui  ON ui.sku_id = s.id
  CROSS JOIN periodo p
  WHERE s.activo = true
    AND m.anio_mes BETWEEN p.desde AND p.hasta
    AND (p_tienda_id IS NULL OR m.tienda_id = p_tienda_id)
    AND (
      p_categoria_id IS NULL
      OR s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (
             (SELECT ruta FROM public.categorias WHERE id = p_categoria_id)
             || '/%'
           )
      )
    )
  GROUP BY s.id, s.nombre, mar.nombre, cat.nombre, ui.mdi_meses, s.imagen_url
  HAVING
    AVG(m.gmroi)       FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100) IS NOT NULL
    OR AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL) IS NOT NULL
  ORDER BY avg_gmroi DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_optimizacion_cuadrante TO authenticated;

-- ============================================================================
-- RPC: get_compras_sugeridas
-- Tabla de órdenes de compra sugeridas basada en histórico de ventas.
-- Conservador: 5 meses de ventas promedio como objetivo.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_compras_sugeridas(
  p_tienda_id    UUID DEFAULT NULL,
  p_categoria_id UUID DEFAULT NULL
)
RETURNS TABLE (
  sku_id             UUID,
  nombre             TEXT,
  marca_nombre       TEXT,
  stock_actual       NUMERIC,
  mdi_actual         NUMERIC,
  avg_ventas_mensual NUMERIC,
  precio_lista       NUMERIC,
  unidades_sugeridas INT,
  valor_orden        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  -- Promedio de ventas de los últimos 6 meses por SKU (agregado o por tienda)
  ventas_base AS (
    SELECT
      v.sku_id,
      ROUND(
        AVG(
          CASE WHEN p_tienda_id IS NULL THEN total_mes ELSE v.unidades END
        )::numeric,
        2
      ) AS avg_ventas_mensual
    FROM (
      SELECT
        sku_id,
        anio_mes,
        SUM(unidades) AS total_mes
      FROM public.ventas_fact
      WHERE anio_mes >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months')::DATE
        AND (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
      GROUP BY sku_id, anio_mes
    ) v
    GROUP BY v.sku_id
  ),
  -- Inventario más reciente por SKU
  inv_actual AS (
    SELECT DISTINCT ON (i.sku_id)
      i.sku_id,
      i.stock_fin   AS stock_actual,
      i.mdi_meses
    FROM public.inventario_fact i
    WHERE (p_tienda_id IS NULL OR i.tienda_id = p_tienda_id)
    ORDER BY i.sku_id, i.anio_mes DESC
  )
  SELECT
    s.id                                                       AS sku_id,
    s.nombre                                                   AS nombre,
    mar.nombre                                                 AS marca_nombre,
    COALESCE(ia.stock_actual, 0)                               AS stock_actual,
    COALESCE(ia.mdi_meses, 0)                                  AS mdi_actual,
    COALESCE(vb.avg_ventas_mensual, 0)                         AS avg_ventas_mensual,
    s.precio_lista                                             AS precio_lista,
    GREATEST(
      0,
      ROUND(COALESCE(vb.avg_ventas_mensual, 0) * 5)
        - COALESCE(ia.stock_actual, 0)
    )::INT                                                     AS unidades_sugeridas,
    GREATEST(
      0,
      (
        ROUND(COALESCE(vb.avg_ventas_mensual, 0) * 5)
          - COALESCE(ia.stock_actual, 0)
      ) * s.precio_lista
    )                                                          AS valor_orden
  FROM public.skus s
  LEFT JOIN public.marcas     mar ON mar.id = s.marca_id
  LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
  LEFT JOIN ventas_base        vb ON vb.sku_id  = s.id
  LEFT JOIN inv_actual         ia ON ia.sku_id  = s.id
  WHERE s.activo = true
    AND (
      p_categoria_id IS NULL
      OR s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (
             (SELECT ruta FROM public.categorias WHERE id = p_categoria_id)
             || '/%'
           )
      )
    )
    -- Solo mostrar SKUs donde se sugiere comprar algo
    AND GREATEST(
      0,
      ROUND(COALESCE(vb.avg_ventas_mensual, 0) * 5)
        - COALESCE(ia.stock_actual, 0)
    ) > 0
  ORDER BY valor_orden DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_sugeridas TO authenticated;
