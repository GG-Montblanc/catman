-- 0010_mv_kpis.sql — Materialized view de KPIs + funciones RPC para el dashboard
-- Phase 1: métricas precalculadas para performance con ~10M filas en ventas_fact

-- ============================================================================
-- MATERIALIZED VIEW: mv_sku_kpis_mensual
-- Base de todos los KPIs: une ventas_fact + inventario_fact y calcula métricas
-- Refrescar mensualmente con: SELECT public.refresh_kpi_views()
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_sku_kpis_mensual AS
SELECT
  v.sku_id,
  v.tienda_id,
  v.anio_mes,
  v.unidades,
  v.unidades_recibidas,
  v.ingreso,
  v.costo,
  v.margen,
  i.stock_inicio,
  i.stock_fin,
  i.stock_promedio,
  i.costo_inventario,
  i.dias_stock,
  i.mdi_meses,
  -- GMROI anualizado = (margen mensual / costo inventario promedio) × 12
  CASE WHEN i.costo_inventario > 0
    THEN ROUND((v.margen / i.costo_inventario * 12)::numeric, 4)
  END AS gmroi,
  -- Sellthru % = unidades vendidas / unidades recibidas
  CASE WHEN v.unidades_recibidas > 0
    THEN ROUND((v.unidades::numeric / v.unidades_recibidas * 100)::numeric, 2)
  END AS sellthru_pct,
  -- Sell-to-Stock mensual = ventas / stock_inicio
  CASE WHEN i.stock_inicio > 0
    THEN ROUND((v.unidades::numeric / i.stock_inicio)::numeric, 4)
  END AS sell_to_stock,
  -- Fill Rate = días con stock / días del mes (0–1)
  LEAST(ROUND((i.dias_stock / 30.0)::numeric, 4), 1.0) AS fill_rate,
  -- Margen %
  CASE WHEN v.ingreso > 0
    THEN ROUND((v.margen / v.ingreso * 100)::numeric, 2)
  END AS margen_pct
FROM public.ventas_fact v
JOIN public.inventario_fact i USING (sku_id, tienda_id, anio_mes)
WITH DATA;

-- Índice único requerido para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpis_pk
  ON public.mv_sku_kpis_mensual (sku_id, tienda_id, anio_mes);
CREATE INDEX IF NOT EXISTS idx_mv_kpis_mes
  ON public.mv_sku_kpis_mensual (anio_mes DESC);
CREATE INDEX IF NOT EXISTS idx_mv_kpis_gmroi
  ON public.mv_sku_kpis_mensual (gmroi DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_mv_kpis_sku_mes
  ON public.mv_sku_kpis_mensual (sku_id, anio_mes DESC);
CREATE INDEX IF NOT EXISTS idx_mv_kpis_tienda_mes
  ON public.mv_sku_kpis_mensual (tienda_id, anio_mes DESC);

-- ============================================================================
-- RPC: dashboard_kpis_globales
-- 7 KPI cards del header del dashboard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dashboard_kpis_globales(
  p_desde    date  DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta    date  DEFAULT CURRENT_DATE::date,
  p_tienda   uuid  DEFAULT NULL,
  p_canal    text  DEFAULT NULL,
  p_region   text  DEFAULT NULL,
  p_formato  text  DEFAULT NULL,
  p_categoria uuid DEFAULT NULL,
  p_marca    uuid  DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'avg_gmroi',         ROUND(AVG(m.gmroi)          FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2),
    'avg_sellthru_pct',  ROUND(AVG(m.sellthru_pct)   FILTER (WHERE m.sellthru_pct IS NOT NULL), 2),
    'avg_sell_to_stock', ROUND(AVG(m.sell_to_stock)  FILTER (WHERE m.sell_to_stock > 0 AND m.sell_to_stock <= 2), 4),
    'avg_margen_pct',    ROUND(AVG(m.margen_pct)     FILTER (WHERE m.margen_pct IS NOT NULL), 2),
    'avg_dias_stock',    ROUND(AVG(m.dias_stock),     1),
    'avg_fill_rate',     ROUND(AVG(m.fill_rate) * 100, 1),
    'pct_obsoletos',     ROUND(
      COUNT(DISTINCT m.sku_id) FILTER (WHERE m.mdi_meses > 6)::numeric /
      NULLIF(COUNT(DISTINCT m.sku_id), 0) * 100, 1
    ),
    'total_ingreso',     SUM(m.ingreso),
    'total_margen',      SUM(m.margen),
    'total_unidades',    SUM(m.unidades)
  )
  FROM public.mv_sku_kpis_mensual m
  JOIN public.tiendas t  ON t.id = m.tienda_id
  JOIN public.skus    s  ON s.id = m.sku_id
  WHERE m.anio_mes BETWEEN p_desde AND p_hasta
    AND (p_tienda   IS NULL OR m.tienda_id  = p_tienda)
    AND (p_canal    IS NULL OR t.canal::text = p_canal)
    AND (p_region   IS NULL OR t.region     = p_region)
    AND (p_formato  IS NULL OR t.formato::text = p_formato)
    AND (p_categoria IS NULL OR s.categoria_id IN (
          SELECT id FROM public.categorias
          WHERE id = p_categoria
             OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria)
        ))
    AND (p_marca    IS NULL OR s.marca_id = p_marca);
$$;

-- ============================================================================
-- RPC: dashboard_tendencia_mensual
-- Serie temporal para el LineChart del dashboard (hasta 24 meses)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dashboard_tendencia_mensual(
  p_desde    date  DEFAULT (CURRENT_DATE - INTERVAL '24 months')::date,
  p_hasta    date  DEFAULT CURRENT_DATE::date,
  p_tienda   uuid  DEFAULT NULL,
  p_canal    text  DEFAULT NULL,
  p_region   text  DEFAULT NULL,
  p_formato  text  DEFAULT NULL,
  p_categoria uuid DEFAULT NULL,
  p_marca    uuid  DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_agg(
    json_build_object(
      'anio_mes',       to_char(r.anio_mes, 'YYYY-MM-DD'),
      'avg_gmroi',      r.avg_gmroi,
      'avg_sellthru',   r.avg_sellthru,
      'avg_margen_pct', r.avg_margen_pct,
      'avg_fill_rate',  r.avg_fill_rate,
      'total_ingreso',  r.total_ingreso,
      'total_margen',   r.total_margen
    )
    ORDER BY r.anio_mes
  )
  FROM (
    SELECT
      m.anio_mes,
      ROUND(AVG(m.gmroi)         FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct)  FILTER (WHERE m.sellthru_pct IS NOT NULL), 2)    AS avg_sellthru,
      ROUND(AVG(m.margen_pct)    FILTER (WHERE m.margen_pct IS NOT NULL), 2)      AS avg_margen_pct,
      ROUND(AVG(m.fill_rate) * 100, 1)                                             AS avg_fill_rate,
      SUM(m.ingreso)                                                                AS total_ingreso,
      SUM(m.margen)                                                                 AS total_margen
    FROM public.mv_sku_kpis_mensual m
    JOIN public.tiendas t ON t.id = m.tienda_id
    JOIN public.skus    s ON s.id = m.sku_id
    WHERE m.anio_mes BETWEEN p_desde AND p_hasta
      AND (p_tienda   IS NULL OR m.tienda_id  = p_tienda)
      AND (p_canal    IS NULL OR t.canal::text = p_canal)
      AND (p_region   IS NULL OR t.region     = p_region)
      AND (p_formato  IS NULL OR t.formato::text = p_formato)
      AND (p_categoria IS NULL OR s.categoria_id IN (
            SELECT id FROM public.categorias
            WHERE id = p_categoria
               OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria)
          ))
      AND (p_marca    IS NULL OR s.marca_id = p_marca)
    GROUP BY m.anio_mes
  ) r;
$$;

-- ============================================================================
-- RPC: dashboard_top_skus_gmroi
-- Top y bottom N SKUs por GMROI en el período
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dashboard_top_skus_gmroi(
  p_desde    date  DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta    date  DEFAULT CURRENT_DATE::date,
  p_tienda   uuid  DEFAULT NULL,
  p_canal    text  DEFAULT NULL,
  p_region   text  DEFAULT NULL,
  p_formato  text  DEFAULT NULL,
  p_categoria uuid DEFAULT NULL,
  p_marca    uuid  DEFAULT NULL,
  p_limit    int   DEFAULT 10
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      s.id          AS sku_id,
      s.nombre,
      s.imagen_url,
      mar.nombre    AS marca_nombre,
      cat.nombre    AS categoria_nombre,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2)    AS avg_sellthru,
      ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2)      AS avg_margen_pct,
      SUM(m.ingreso)  AS total_ingreso,
      SUM(m.margen)   AS total_margen
    FROM public.mv_sku_kpis_mensual m
    JOIN public.skus            s   ON s.id   = m.sku_id
    LEFT JOIN public.marcas     mar ON mar.id = s.marca_id
    LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
    JOIN public.tiendas         t   ON t.id   = m.tienda_id
    WHERE m.anio_mes BETWEEN p_desde AND p_hasta
      AND (p_tienda   IS NULL OR m.tienda_id  = p_tienda)
      AND (p_canal    IS NULL OR t.canal::text = p_canal)
      AND (p_region   IS NULL OR t.region     = p_region)
      AND (p_formato  IS NULL OR t.formato::text = p_formato)
      AND (p_categoria IS NULL OR s.categoria_id IN (
            SELECT id FROM public.categorias
            WHERE id = p_categoria
               OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria)
          ))
      AND (p_marca    IS NULL OR s.marca_id = p_marca)
    GROUP BY s.id, s.nombre, s.imagen_url, mar.nombre, cat.nombre
    HAVING AVG(m.gmroi) FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100) IS NOT NULL
  )
  SELECT json_build_object(
    'top', (
      SELECT json_agg(r)
      FROM (SELECT * FROM ranked ORDER BY avg_gmroi DESC NULLS LAST LIMIT p_limit) r
    ),
    'bottom', (
      SELECT json_agg(r)
      FROM (SELECT * FROM ranked ORDER BY avg_gmroi ASC NULLS LAST LIMIT p_limit) r
    )
  );
$$;

-- ============================================================================
-- RPC: dashboard_heatmap_cat_tienda
-- Matriz categoría raíz × tienda para el heatmap de GMROI
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dashboard_heatmap_cat_tienda(
  p_desde  date DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta  date DEFAULT CURRENT_DATE::date
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_agg(
    json_build_object(
      'cat_id',       cat_root.id,
      'cat_nombre',   cat_root.nombre,
      'tienda_id',    t.id,
      'tienda_nombre', t.nombre,
      'avg_gmroi',    ROUND(AVG(m.gmroi) FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2),
      'total_ingreso', SUM(m.ingreso)
    )
  )
  FROM public.mv_sku_kpis_mensual m
  JOIN public.skus            s        ON s.id   = m.sku_id
  JOIN public.categorias      cat      ON cat.id = s.categoria_id
  JOIN public.categorias      cat_root ON cat_root.ruta = split_part(cat.ruta, '/', 1)
  JOIN public.tiendas         t        ON t.id   = m.tienda_id
  WHERE m.anio_mes BETWEEN p_desde AND p_hasta
  GROUP BY cat_root.id, cat_root.nombre, t.id, t.nombre;
$$;

-- ============================================================================
-- RPC: get_skus_con_kpis
-- Listado paginado de SKUs con sus KPIs para la tabla /skus
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_skus_con_kpis(
  p_desde    date    DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta    date    DEFAULT CURRENT_DATE::date,
  p_categoria uuid   DEFAULT NULL,
  p_marca    uuid    DEFAULT NULL,
  p_buscar   text    DEFAULT NULL,
  p_orden    text    DEFAULT 'gmroi_desc',
  p_offset   int     DEFAULT 0,
  p_limit    int     DEFAULT 50
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH sku_kpis AS (
    SELECT
      s.id,
      s.sku_externo,
      s.nombre,
      s.imagen_url,
      s.precio_lista,
      mar.nombre                                                                    AS marca_nombre,
      cat.nombre                                                                    AS categoria_nombre,
      cat.ruta                                                                      AS categoria_ruta,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2)  AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru_pct,
      ROUND(AVG(m.sell_to_stock) FILTER (WHERE m.sell_to_stock > 0), 4)           AS avg_s2s,
      ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(AVG(m.dias_stock), 1)                                                  AS avg_dias_stock,
      ROUND(AVG(m.fill_rate) * 100, 1)                                             AS avg_fill_rate,
      ROUND(AVG(m.mdi_meses), 2)                                                   AS avg_mdi_meses,
      SUM(m.ingreso)                                                                AS total_ingreso,
      SUM(m.margen)                                                                 AS total_margen
    FROM public.skus s
    LEFT JOIN public.marcas     mar ON mar.id = s.marca_id
    LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
    LEFT JOIN public.mv_sku_kpis_mensual m
           ON m.sku_id = s.id AND m.anio_mes BETWEEN p_desde AND p_hasta
    WHERE s.activo = true
      AND (p_categoria IS NULL OR s.categoria_id IN (
            SELECT id FROM public.categorias
            WHERE id = p_categoria
               OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria)
          ))
      AND (p_marca  IS NULL OR s.marca_id = p_marca)
      AND (p_buscar IS NULL OR s.nombre ILIKE '%' || p_buscar || '%'
                            OR mar.nombre ILIKE '%' || p_buscar || '%')
    GROUP BY s.id, s.sku_externo, s.nombre, s.imagen_url, s.precio_lista,
             mar.nombre, cat.nombre, cat.ruta
  ),
  total AS (SELECT COUNT(*) AS n FROM sku_kpis),
  paged AS (
    SELECT * FROM sku_kpis
    ORDER BY
      CASE p_orden
        WHEN 'gmroi_desc'       THEN avg_gmroi            END DESC NULLS LAST,
      CASE p_orden
        WHEN 'gmroi_asc'        THEN avg_gmroi            END ASC NULLS LAST,
      CASE p_orden
        WHEN 'sellthru_desc'    THEN avg_sellthru_pct     END DESC NULLS LAST,
      CASE p_orden
        WHEN 'mdi_desc'         THEN avg_mdi_meses        END DESC NULLS LAST,
      CASE p_orden
        WHEN 'ingreso_desc'     THEN total_ingreso        END DESC NULLS LAST,
      nombre ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT json_build_object(
    'total',    (SELECT n FROM total),
    'skus',     json_agg(p)
  )
  FROM paged p;
$$;

-- ============================================================================
-- Función de refresco (llamar desde cron mensual)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_kpi_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sku_kpis_mensual;
END;
$$;

-- Grant de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.dashboard_kpis_globales      TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_tendencia_mensual  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_top_skus_gmroi     TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_heatmap_cat_tienda TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_skus_con_kpis            TO authenticated;
GRANT SELECT  ON public.mv_sku_kpis_mensual                   TO authenticated;
