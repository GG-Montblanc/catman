-- 0060_categorias_tiendas.sql
-- RPCs para páginas de Categorías y Tiendas (Phase 6)

-- ============================================================================
-- RPC: get_categorias_kpis
-- KPIs agregados por categoría, solo las que tienen ventas en el período
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_categorias_kpis(
  p_meses INT DEFAULT 6
)
RETURNS TABLE (
  categoria_id   UUID,
  nombre         TEXT,
  nivel          INT,
  parent_nombre  TEXT,
  n_skus         BIGINT,
  avg_gmroi      NUMERIC,
  avg_sellthru   NUMERIC,
  avg_margen_pct NUMERIC,
  total_ingreso  NUMERIC,
  total_unidades BIGINT,
  tendencia_gmroi TEXT   -- 'up' | 'flat' | 'down'
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ventana AS (
    SELECT date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date AS inicio
  ),
  mitad AS (
    -- Punto de corte: mitad del período
    SELECT date_trunc('month', CURRENT_DATE - ((p_meses / 2 - 1) || ' months')::interval)::date AS corte
  ),
  kpis_base AS (
    SELECT
      s.categoria_id,
      k.anio_mes,
      AVG(k.gmroi)        AS mes_gmroi,
      AVG(k.sellthru_pct) AS mes_sellthru,
      AVG(k.margen_pct)   AS mes_margen,
      SUM(k.ingreso)      AS mes_ingreso,
      SUM(k.unidades)     AS mes_unidades,
      COUNT(DISTINCT k.sku_id) AS mes_skus
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    WHERE k.anio_mes >= (SELECT inicio FROM ventana)
      AND s.categoria_id IS NOT NULL
    GROUP BY s.categoria_id, k.anio_mes
  ),
  agg AS (
    SELECT
      categoria_id,
      COUNT(DISTINCT mes_skus)                                         AS n_skus,
      ROUND(AVG(mes_gmroi)    FILTER (WHERE mes_gmroi > 0 AND mes_gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(mes_sellthru) FILTER (WHERE mes_sellthru IS NOT NULL), 2)           AS avg_sellthru,
      ROUND(AVG(mes_margen)   FILTER (WHERE mes_margen IS NOT NULL), 2)             AS avg_margen_pct,
      ROUND(SUM(mes_ingreso), 0)                                       AS total_ingreso,
      SUM(mes_unidades)::BIGINT                                        AS total_unidades,
      -- Tendencia: primera mitad vs segunda mitad
      ROUND(AVG(mes_gmroi) FILTER (WHERE anio_mes <  (SELECT corte FROM mitad) AND mes_gmroi > 0), 4) AS gmroi_primera,
      ROUND(AVG(mes_gmroi) FILTER (WHERE anio_mes >= (SELECT corte FROM mitad) AND mes_gmroi > 0), 4) AS gmroi_segunda
    FROM kpis_base
    GROUP BY categoria_id
  )
  SELECT
    c.id                   AS categoria_id,
    c.nombre,
    c.nivel::INT,
    cp.nombre              AS parent_nombre,
    COALESCE(a.n_skus, 0)  AS n_skus,
    COALESCE(a.avg_gmroi, 0)       AS avg_gmroi,
    COALESCE(a.avg_sellthru, 0)    AS avg_sellthru,
    COALESCE(a.avg_margen_pct, 0)  AS avg_margen_pct,
    COALESCE(a.total_ingreso, 0)   AS total_ingreso,
    COALESCE(a.total_unidades, 0)  AS total_unidades,
    CASE
      WHEN a.gmroi_primera IS NULL OR a.gmroi_segunda IS NULL THEN 'flat'
      WHEN a.gmroi_segunda > a.gmroi_primera * 1.05 THEN 'up'
      WHEN a.gmroi_segunda < a.gmroi_primera * 0.95 THEN 'down'
      ELSE 'flat'
    END                    AS tendencia_gmroi
  FROM agg a
  JOIN public.categorias c  ON c.id = a.categoria_id
  LEFT JOIN public.categorias cp ON cp.id = c.parent_id
  WHERE a.total_ingreso > 0
  ORDER BY a.total_ingreso DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_categorias_kpis TO authenticated;

-- ============================================================================
-- RPC: get_categoria_detalle
-- Retorna JSON con KPIs, top/bottom SKUs, evolución mensual, desglose subfamilia
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_categoria_detalle(
  p_categoria_id UUID,
  p_meses        INT DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_inicio       DATE;
  v_kpis         JSON;
  v_top_skus     JSON;
  v_bottom_skus  JSON;
  v_evolucion    JSON;
  v_subfamilias  JSON;
BEGIN
  v_inicio := date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date;

  -- KPIs globales de la categoría
  SELECT row_to_json(q) INTO v_kpis
  FROM (
    SELECT
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(SUM(k.ingreso), 0)                                                     AS total_ingreso,
      SUM(k.unidades)::BIGINT                                                      AS total_unidades,
      COUNT(DISTINCT k.sku_id)::BIGINT                                             AS n_skus
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
  ) q;

  -- Top 10 SKUs por GMROI
  SELECT json_agg(q) INTO v_top_skus
  FROM (
    SELECT
      s.id         AS sku_id,
      s.nombre,
      mar.nombre   AS marca,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi,
      ROUND(AVG(k.sellthru_pct), 2)                                         AS sellthru,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      s.imagen_url
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
    GROUP BY s.id, s.nombre, mar.nombre, s.imagen_url
    HAVING SUM(k.unidades) > 0
    ORDER BY AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) DESC NULLS LAST
    LIMIT 10
  ) q;

  -- Bottom 5 SKUs (menor GMROI, con ventas > 0)
  SELECT json_agg(q) INTO v_bottom_skus
  FROM (
    SELECT
      s.id         AS sku_id,
      s.nombre,
      mar.nombre   AS marca,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi,
      ROUND(AVG(k.sellthru_pct), 2)                                         AS sellthru,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      s.imagen_url
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
    GROUP BY s.id, s.nombre, mar.nombre, s.imagen_url
    HAVING SUM(k.unidades) > 0
       AND AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) IS NOT NULL
    ORDER BY AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) ASC NULLS LAST
    LIMIT 5
  ) q;

  -- Evolución mensual de GMROI
  SELECT json_agg(q ORDER BY q.mes) INTO v_evolucion
  FROM (
    SELECT
      to_char(k.anio_mes, 'YYYY-MM') AS mes,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
    GROUP BY k.anio_mes
  ) q;

  -- Desglose por subfamilia (nivel directo + 1, o nivel 2 relativo)
  SELECT json_agg(q ORDER BY q.ingreso DESC) INTO v_subfamilias
  FROM (
    SELECT
      csub.nombre,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2)   AS gmroi,
      COUNT(DISTINCT k.sku_id)::BIGINT                                        AS n_skus
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    -- Buscar la subfamilia: categoría hija directa de p_categoria_id que es ancestro del SKU
    JOIN public.categorias csub ON (
      csub.parent_id = p_categoria_id
      AND (
        s.categoria_id = csub.id
        OR s.categoria_id IN (
          SELECT id FROM public.categorias
          WHERE ruta LIKE csub.ruta || '/%'
        )
      )
    )
    WHERE k.anio_mes >= v_inicio
    GROUP BY csub.nombre
    HAVING SUM(k.unidades) > 0
  ) q;

  RETURN json_build_object(
    'kpis',        v_kpis,
    'top_skus',    COALESCE(v_top_skus,    '[]'::json),
    'bottom_skus', COALESCE(v_bottom_skus, '[]'::json),
    'evolucion',   COALESCE(v_evolucion,   '[]'::json),
    'subfamilias', COALESCE(v_subfamilias, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categoria_detalle TO authenticated;

-- ============================================================================
-- RPC: get_tiendas_kpis
-- KPIs por tienda con ranking dentro del mismo formato
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_tiendas_kpis(
  p_meses INT DEFAULT 6
)
RETURNS TABLE (
  tienda_id      UUID,
  nombre         TEXT,
  ciudad         TEXT,
  region         TEXT,
  canal          TEXT,
  formato        TEXT,
  avg_gmroi      NUMERIC,
  avg_sellthru   NUMERIC,
  avg_margen_pct NUMERIC,
  total_ingreso  NUMERIC,
  total_unidades BIGINT,
  n_skus_activos BIGINT,
  rank_gmroi     INT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ventana AS (
    SELECT date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date AS inicio
  ),
  agg AS (
    SELECT
      k.tienda_id,
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(SUM(k.ingreso), 0)                                                     AS total_ingreso,
      SUM(k.unidades)::BIGINT                                                      AS total_unidades,
      COUNT(DISTINCT k.sku_id)::BIGINT                                             AS n_skus_activos
    FROM public.mv_sku_kpis_mensual k
    WHERE k.anio_mes >= (SELECT inicio FROM ventana)
    GROUP BY k.tienda_id
    HAVING SUM(k.unidades) > 0
  )
  SELECT
    t.id           AS tienda_id,
    t.nombre,
    t.ciudad,
    t.region,
    t.canal,
    t.formato,
    COALESCE(a.avg_gmroi, 0)       AS avg_gmroi,
    COALESCE(a.avg_sellthru, 0)    AS avg_sellthru,
    COALESCE(a.avg_margen_pct, 0)  AS avg_margen_pct,
    COALESCE(a.total_ingreso, 0)   AS total_ingreso,
    COALESCE(a.total_unidades, 0)  AS total_unidades,
    COALESCE(a.n_skus_activos, 0)  AS n_skus_activos,
    RANK() OVER (
      PARTITION BY t.formato
      ORDER BY COALESCE(a.avg_gmroi, 0) DESC
    )::INT                         AS rank_gmroi
  FROM agg a
  JOIN public.tiendas t ON t.id = a.tienda_id
  ORDER BY a.total_ingreso DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_tiendas_kpis TO authenticated;

-- ============================================================================
-- RPC: get_tienda_detalle
-- JSON con KPIs, benchmark formato, top categorías, evolución mensual, top SKUs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_tienda_detalle(
  p_tienda_id UUID,
  p_meses     INT DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_inicio        DATE;
  v_formato       TEXT;
  v_kpis          JSON;
  v_benchmark     JSON;
  v_top_cats      JSON;
  v_evolucion     JSON;
  v_top_skus      JSON;
BEGIN
  v_inicio := date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date;

  -- Obtener formato de la tienda
  SELECT formato INTO v_formato FROM public.tiendas WHERE id = p_tienda_id;

  -- KPIs globales de la tienda
  SELECT row_to_json(q) INTO v_kpis
  FROM (
    SELECT
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(SUM(k.ingreso), 0)                                                     AS total_ingreso,
      SUM(k.unidades)::BIGINT                                                      AS total_unidades,
      COUNT(DISTINCT k.sku_id)::BIGINT                                             AS n_skus
    FROM public.mv_sku_kpis_mensual k
    WHERE k.tienda_id = p_tienda_id
      AND k.anio_mes >= v_inicio
  ) q;

  -- Benchmark: promedio de todas las tiendas del mismo formato
  SELECT row_to_json(q) INTO v_benchmark
  FROM (
    SELECT
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(AVG(sub.t_ingreso), 0)                                                  AS avg_ingreso
    FROM public.mv_sku_kpis_mensual k
    JOIN public.tiendas t ON t.id = k.tienda_id
    JOIN (
      SELECT k2.tienda_id, SUM(k2.ingreso) AS t_ingreso
      FROM public.mv_sku_kpis_mensual k2
      WHERE k2.anio_mes >= v_inicio
      GROUP BY k2.tienda_id
    ) sub ON sub.tienda_id = k.tienda_id
    WHERE t.formato = v_formato
      AND k.anio_mes >= v_inicio
  ) q;

  -- Top 5 categorías por ingreso (con GMROI)
  SELECT json_agg(q ORDER BY q.ingreso DESC) INTO v_top_cats
  FROM (
    SELECT
      c.nombre,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2)   AS gmroi
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    JOIN public.categorias c ON c.id = s.categoria_id
    WHERE k.tienda_id = p_tienda_id
      AND k.anio_mes >= v_inicio
    GROUP BY c.nombre
    HAVING SUM(k.unidades) > 0
    ORDER BY SUM(k.ingreso) DESC
    LIMIT 5
  ) q;

  -- Evolución mensual: tienda + promedio formato
  SELECT json_agg(q ORDER BY q.mes) INTO v_evolucion
  FROM (
    WITH tienda_mes AS (
      SELECT
        to_char(k.anio_mes, 'YYYY-MM') AS mes,
        ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi_tienda
      FROM public.mv_sku_kpis_mensual k
      WHERE k.tienda_id = p_tienda_id
        AND k.anio_mes >= v_inicio
      GROUP BY k.anio_mes
    ),
    formato_mes AS (
      SELECT
        to_char(k.anio_mes, 'YYYY-MM') AS mes,
        ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi_formato
      FROM public.mv_sku_kpis_mensual k
      JOIN public.tiendas t ON t.id = k.tienda_id
      WHERE t.formato = v_formato
        AND k.anio_mes >= v_inicio
      GROUP BY k.anio_mes
    )
    SELECT
      tm.mes,
      tm.gmroi_tienda,
      fm.gmroi_formato
    FROM tienda_mes tm
    LEFT JOIN formato_mes fm ON fm.mes = tm.mes
  ) q;

  -- Top 10 SKUs de la tienda por GMROI
  SELECT json_agg(q) INTO v_top_skus
  FROM (
    SELECT
      s.id         AS sku_id,
      s.nombre,
      mar.nombre   AS marca,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi,
      ROUND(AVG(k.sellthru_pct), 2)                                         AS sellthru,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      s.imagen_url
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE k.tienda_id = p_tienda_id
      AND k.anio_mes >= v_inicio
    GROUP BY s.id, s.nombre, mar.nombre, s.imagen_url
    HAVING SUM(k.unidades) > 0
    ORDER BY AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) DESC NULLS LAST
    LIMIT 10
  ) q;

  RETURN json_build_object(
    'kpis',       v_kpis,
    'benchmark',  v_benchmark,
    'top_cats',   COALESCE(v_top_cats,  '[]'::json),
    'evolucion',  COALESCE(v_evolucion, '[]'::json),
    'top_skus',   COALESCE(v_top_skus,  '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tienda_detalle TO authenticated;
