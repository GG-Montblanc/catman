-- 0099_rotacion_y_rentabilidad_atributo.sql
-- Cierra los 2 gaps restantes de la lista original de indicadores:
--
-- 1) Rotación de inventario explícita ("N veces al año"). Hoy solo se
--    infería indirectamente vía MDI (meses de inventario) o Sell-to-Stock
--    (% semanal). Se agrega rotacion_anual = costo de venta anualizado /
--    costo de inventario promedio — el mismo par de columnas que ya usa
--    GMROI (costo, costo_inventario), solo que dividiendo por costo en
--    vez de margen. No requiere tocar la materialized view: ambas
--    columnas ya existen en mv_sku_kpis_mensual.
--
-- 2) Rentabilidad por valor de atributo (ej. "¿rojo rinde mejor que nude
--    en GMROI?", no solo en volumen). get_tendencias_atributo ya existe
--    pero solo trae unidades/ingreso por mes (serie de tiempo). Se agrega
--    get_rentabilidad_atributo: snapshot agregado del período completo
--    con GMROI/margen/sellthru promedio por valor, para comparar
--    rentabilidad entre valores de un mismo atributo (no su evolución).

-- ============================================================================
-- dashboard_kpis_globales: se agrega avg_rotacion_anual
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
    'avg_rotacion_anual', ROUND(AVG(m.costo / NULLIF(m.costo_inventario, 0) * 12) FILTER (WHERE m.costo_inventario > 0 AND m.costo / NULLIF(m.costo_inventario, 0) * 12 < 100), 2),
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
-- dashboard_tendencia_mensual: se agrega avg_rotacion_anual a la serie
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
      'avg_rotacion_anual', r.avg_rotacion_anual,
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
      ROUND(AVG(m.costo / NULLIF(m.costo_inventario, 0) * 12) FILTER (WHERE m.costo_inventario > 0 AND m.costo / NULLIF(m.costo_inventario, 0) * 12 < 100), 2) AS avg_rotacion_anual,
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
-- get_skus_con_kpis: se agrega avg_rotacion_anual por SKU
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
      ROUND(AVG(m.costo / NULLIF(m.costo_inventario, 0) * 12) FILTER (WHERE m.costo_inventario > 0 AND m.costo / NULLIF(m.costo_inventario, 0) * 12 < 100), 2) AS avg_rotacion_anual,
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
-- RPC: get_rentabilidad_atributo
-- Snapshot agregado (no serie de tiempo) de GMROI/margen/sellthru por valor
-- de atributo — para comparar rentabilidad entre valores (ej. rojo vs nude)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_rentabilidad_atributo(
  p_categoria_id UUID,
  p_atributo     TEXT,
  p_meses        INT DEFAULT 12
)
RETURNS TABLE(
  valor            TEXT,
  n_skus           BIGINT,
  total_unidades   BIGINT,
  total_ingreso    NUMERIC,
  avg_gmroi        NUMERIC,
  avg_margen_pct   NUMERIC,
  avg_sellthru_pct NUMERIC,
  pct_ingreso_categoria NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH skus_cat AS (
    SELECT s.id, s.atributos->>p_atributo AS val
    FROM public.skus s
    WHERE s.activo = true
      AND s.atributos IS NOT NULL
      AND s.atributos->>p_atributo IS NOT NULL
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
  ),
  ventana AS (
    SELECT date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date AS inicio
  ),
  por_valor AS (
    SELECT
      sc.val AS valor,
      COUNT(DISTINCT sc.id)                                                       AS n_skus,
      SUM(m.unidades)::BIGINT                                                     AS total_unidades,
      SUM(m.ingreso)                                                              AS total_ingreso,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2)      AS avg_margen_pct,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2)    AS avg_sellthru_pct
    FROM skus_cat sc
    JOIN public.mv_sku_kpis_mensual m ON m.sku_id = sc.id
    WHERE m.anio_mes >= (SELECT inicio FROM ventana)
    GROUP BY sc.val
  ),
  total_cat AS (
    SELECT SUM(total_ingreso) AS n FROM por_valor
  )
  SELECT
    pv.valor,
    pv.n_skus,
    pv.total_unidades,
    ROUND(pv.total_ingreso, 0) AS total_ingreso,
    pv.avg_gmroi,
    pv.avg_margen_pct,
    pv.avg_sellthru_pct,
    ROUND(pv.total_ingreso / NULLIF((SELECT n FROM total_cat), 0) * 100, 2) AS pct_ingreso_categoria
  FROM por_valor pv
  ORDER BY pv.avg_gmroi DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_rentabilidad_atributo TO authenticated;
