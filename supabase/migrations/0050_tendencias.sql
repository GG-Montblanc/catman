-- 0050_tendencias.sql
-- RPCs para Phase 5: tendencias por atributo, espacio por marca, MDI

-- ============================================================================
-- RPC: get_atributos_disponibles
-- Retorna las keys del JSONB atributos disponibles en una categoría
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_atributos_disponibles(p_categoria_id UUID)
RETURNS TABLE(atributo TEXT, n_valores BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT k, COUNT(DISTINCT s.atributos->>k)
  FROM public.skus s,
       LATERAL jsonb_object_keys(s.atributos) k
  WHERE s.activo = true
    AND s.atributos IS NOT NULL
    AND s.atributos != '{}'::jsonb
    AND s.categoria_id IN (
      SELECT id FROM public.categorias
      WHERE id = p_categoria_id
         OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
    )
  GROUP BY k
  HAVING COUNT(DISTINCT s.atributos->>k) > 1
  ORDER BY COUNT(DISTINCT s.atributos->>k) DESC;
$$;

-- ============================================================================
-- RPC: get_tendencias_atributo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_tendencias_atributo(
  p_categoria_id UUID,
  p_atributo     TEXT,
  p_meses        INT DEFAULT 12
)
RETURNS TABLE(
  valor          TEXT,
  mes            DATE,
  total_unidades BIGINT,
  total_ingreso  NUMERIC,
  pct_categoria  NUMERIC
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
           OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
      )
  ),
  ventana AS (
    SELECT date_trunc('month', CURRENT_DATE - ((p_meses-1)||' months')::interval)::date AS inicio
  ),
  por_valor AS (
    SELECT
      sc.val AS valor,
      vf.anio_mes AS mes,
      SUM(vf.unidades)::BIGINT AS total_unidades,
      SUM(vf.ingreso)::NUMERIC AS total_ingreso
    FROM public.ventas_fact vf
    JOIN skus_cat sc ON sc.id = vf.sku_id
    WHERE vf.anio_mes >= (SELECT inicio FROM ventana)
    GROUP BY sc.val, vf.anio_mes
  ),
  total_cat AS (
    SELECT vf.anio_mes AS mes, SUM(vf.ingreso) AS total_cat_ingreso
    FROM public.ventas_fact vf
    JOIN public.skus s ON s.id = vf.sku_id
    WHERE s.categoria_id IN (
      SELECT id FROM public.categorias
      WHERE id = p_categoria_id
         OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
    )
    AND vf.anio_mes >= (SELECT inicio FROM ventana)
    GROUP BY vf.anio_mes
  )
  SELECT
    pv.valor,
    pv.mes,
    pv.total_unidades,
    pv.total_ingreso,
    ROUND(100.0 * pv.total_ingreso / NULLIF(tc.total_cat_ingreso, 0), 2) AS pct_categoria
  FROM por_valor pv
  LEFT JOIN total_cat tc ON tc.mes = pv.mes
  ORDER BY pv.mes, pv.total_ingreso DESC;
$$;

-- ============================================================================
-- RPC: get_espacio_marca
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_espacio_marca(
  p_planograma_id UUID DEFAULT NULL,
  p_tienda_id     UUID DEFAULT NULL,
  p_categoria_id  UUID DEFAULT NULL
)
RETURNS TABLE(
  marca_id       UUID,
  marca_nombre   TEXT,
  slots_actuales BIGINT,
  pct_espacio    NUMERIC,
  total_ingreso  NUMERIC,
  pct_ventas     NUMERIC,
  avg_gmroi      NUMERIC,
  slots_optimos  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH slots_filtrados AS (
    SELECT ps.sku_id, p.tienda_id, p.categoria_id
    FROM public.planograma_slots ps
    JOIN public.planogramas p ON p.id = ps.planograma_id
    WHERE (p_planograma_id IS NULL OR p.id = p_planograma_id)
      AND (p_tienda_id     IS NULL OR p.tienda_id = p_tienda_id)
      AND (p_categoria_id  IS NULL OR p.categoria_id = p_categoria_id)
  ),
  total_slots AS (
    SELECT COUNT(*) AS n FROM slots_filtrados
  ),
  por_marca AS (
    SELECT
      s.marca_id,
      COUNT(*)                                  AS slots_actuales,
      SUM(m3.ingreso)                           AS total_ingreso,
      ROUND(AVG(m3.gmroi) FILTER (WHERE m3.gmroi > 0 AND m3.gmroi < 100), 2) AS avg_gmroi
    FROM slots_filtrados sf
    JOIN public.skus s ON s.id = sf.sku_id
    LEFT JOIN LATERAL (
      SELECT SUM(vf.ingreso) AS ingreso,
             AVG(k.gmroi)    AS gmroi
      FROM public.ventas_fact vf
      JOIN public.mv_sku_kpis_mensual k
        ON k.sku_id = vf.sku_id AND k.tienda_id = vf.tienda_id AND k.anio_mes = vf.anio_mes
      WHERE vf.sku_id = s.id
        AND vf.anio_mes >= date_trunc('month', CURRENT_DATE - '3 months'::interval)::date
    ) m3 ON true
    GROUP BY s.marca_id
  ),
  total_ventas AS (SELECT SUM(total_ingreso) AS n FROM por_marca)
  SELECT
    pm.marca_id,
    mar.nombre                                                         AS marca_nombre,
    pm.slots_actuales,
    ROUND(100.0 * pm.slots_actuales / NULLIF((SELECT n FROM total_slots),0), 2) AS pct_espacio,
    COALESCE(pm.total_ingreso, 0)                                      AS total_ingreso,
    ROUND(100.0 * pm.total_ingreso / NULLIF((SELECT n FROM total_ventas),0), 2) AS pct_ventas,
    COALESCE(pm.avg_gmroi, 0)                                          AS avg_gmroi,
    -- Espacio óptimo: 70% ponderado por ventas + 30% por GMROI relativo
    ROUND(
      (SELECT n FROM total_slots) *
      (0.7 * COALESCE(pm.total_ingreso,0) / NULLIF((SELECT n FROM total_ventas),0) +
       0.3 * COALESCE(pm.avg_gmroi,0)   / NULLIF((SELECT MAX(avg_gmroi) FROM por_marca),0))
    , 1) AS slots_optimos
  FROM por_marca pm
  JOIN public.marcas mar ON mar.id = pm.marca_id
  ORDER BY pm.total_ingreso DESC NULLS LAST;
$$;

-- ============================================================================
-- RPC: get_skus_mdi
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_skus_mdi(
  p_tienda_id    UUID DEFAULT NULL,
  p_categoria_id UUID DEFAULT NULL,
  p_mdi_min      NUMERIC DEFAULT 0,
  p_mdi_max      NUMERIC DEFAULT 36,
  p_limit        INT DEFAULT 200
)
RETURNS TABLE(
  sku_id             UUID,
  nombre             TEXT,
  marca_nombre       TEXT,
  categoria_nombre   TEXT,
  imagen_url         TEXT,
  precio_lista       NUMERIC,
  mdi_actual         NUMERIC,
  stock_actual       NUMERIC,
  avg_ventas_mensual NUMERIC,
  valor_inventario   NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ultimo_mes AS (
    SELECT MAX(anio_mes) AS mes FROM public.inventario_fact
    WHERE (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
  ),
  inv AS (
    SELECT
      sku_id,
      AVG(mdi_meses)::NUMERIC   AS mdi_actual,
      AVG(stock_fin)::NUMERIC   AS stock_actual,
      AVG(costo_inventario)::NUMERIC AS valor_inventario
    FROM public.inventario_fact
    WHERE anio_mes = (SELECT mes FROM ultimo_mes)
      AND (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
    GROUP BY sku_id
  ),
  ventas_prom AS (
    SELECT
      sku_id,
      AVG(unidades)::NUMERIC AS avg_ventas_mensual
    FROM public.ventas_fact
    WHERE anio_mes >= date_trunc('month', CURRENT_DATE - '3 months'::interval)::date
      AND (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
    GROUP BY sku_id
  )
  SELECT
    s.id           AS sku_id,
    s.nombre,
    mar.nombre     AS marca_nombre,
    cat.nombre     AS categoria_nombre,
    s.imagen_url,
    s.precio_lista,
    COALESCE(i.mdi_actual, 0)         AS mdi_actual,
    COALESCE(i.stock_actual, 0)       AS stock_actual,
    COALESCE(vp.avg_ventas_mensual,0) AS avg_ventas_mensual,
    COALESCE(i.valor_inventario, 0)   AS valor_inventario
  FROM public.skus s
  JOIN inv i ON i.sku_id = s.id
  LEFT JOIN ventas_prom vp ON vp.sku_id = s.id
  LEFT JOIN public.marcas mar ON mar.id = s.marca_id
  LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
  WHERE s.activo = true
    AND COALESCE(i.mdi_actual, 0) BETWEEN p_mdi_min AND p_mdi_max
    AND (p_categoria_id IS NULL OR s.categoria_id IN (
      SELECT id FROM public.categorias
      WHERE id = p_categoria_id
         OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
    ))
  ORDER BY i.mdi_actual DESC NULLS LAST
  LIMIT p_limit;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_atributos_disponibles TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tendencias_atributo   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_espacio_marca         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_skus_mdi              TO authenticated;
