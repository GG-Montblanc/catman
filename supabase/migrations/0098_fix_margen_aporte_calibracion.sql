-- 0098_fix_margen_aporte_calibracion.sql
-- 0097 calibraba el % de aporte con umbrales ABSOLUTOS de margen (0% margen
-- -> 8% aporte, 50%+ margen -> 2% piso), asumiendo que el margen bruto de
-- las marcas variaria en un rango amplio. Verificado con datos reales: el
-- margen bruto de TODAS las marcas del portafolio cae en un rango angosto
-- (40%-47%), asi que con la formula absoluta las 65 marcas de terceros
-- caian exactamente en el piso de 2% — cero variacion, sin utilidad para
-- comparar marcas entre si.
--
-- Se recalibra a un modelo RELATIVO: el % de aporte de cada marca depende
-- de su posicion dentro del rango de margenes del propio portafolio (min-max
-- entre las marcas de terceros del período/filtro consultado), no de un
-- umbral fijo. La marca con el margen mas bajo del portafolio queda en 8%,
-- la de margen mas alto en 2%, y el resto se interpola linealmente. Esto
-- si produce variacion real entre marcas sin importar en que rango absoluto
-- se mueva el margen bruto del negocio.

DROP FUNCTION IF EXISTS public._aporte_pct(numeric);

CREATE OR REPLACE FUNCTION public._aporte_pct(p_margen numeric, p_min numeric, p_max numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_margen IS NULL OR p_min IS NULL OR p_max IS NULL THEN 0.05
    WHEN p_max > p_min THEN 0.08 - 0.06 * (p_margen - p_min) / (p_max - p_min)
    ELSE 0.05
  END;
$$;

-- ============================================================================
-- RPC: get_margen_aporte_resumen (recalibrado)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_margen_aporte_resumen(
  p_desde     date DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta     date DEFAULT CURRENT_DATE::date,
  p_tienda    uuid DEFAULT NULL,
  p_canal     text DEFAULT NULL,
  p_region    text DEFAULT NULL,
  p_formato   text DEFAULT NULL,
  p_categoria uuid DEFAULT NULL,
  p_marca     uuid DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH por_marca AS (
    SELECT
      s.marca_id,
      mar.propia,
      SUM(m.ingreso) AS total_ingreso,
      SUM(m.margen)  AS total_margen_bruto,
      CASE WHEN SUM(m.ingreso) > 0 THEN SUM(m.margen) / SUM(m.ingreso) * 100 END AS margen_pct_bruto
    FROM public.mv_sku_kpis_mensual m
    JOIN public.skus    s   ON s.id = m.sku_id
    JOIN public.marcas  mar ON mar.id = s.marca_id
    JOIN public.tiendas t   ON t.id = m.tienda_id
    WHERE m.anio_mes BETWEEN p_desde AND p_hasta
      AND (p_tienda    IS NULL OR m.tienda_id  = p_tienda)
      AND (p_canal     IS NULL OR t.canal::text = p_canal)
      AND (p_region    IS NULL OR t.region     = p_region)
      AND (p_formato   IS NULL OR t.formato::text = p_formato)
      AND (p_categoria IS NULL OR s.categoria_id IN (
            SELECT id FROM public.categorias
            WHERE id = p_categoria
               OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria)
          ))
      AND (p_marca     IS NULL OR s.marca_id = p_marca)
    GROUP BY s.marca_id, mar.propia
  ),
  bounds AS (
    SELECT MIN(margen_pct_bruto) AS min_m, MAX(margen_pct_bruto) AS max_m
    FROM por_marca WHERE NOT propia AND total_ingreso > 0
  ),
  con_aporte AS (
    SELECT
      pm.*,
      CASE WHEN NOT pm.propia AND pm.total_ingreso > 0
        THEN pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto, b.min_m, b.max_m)
        ELSE 0
      END AS aporte
    FROM por_marca pm CROSS JOIN bounds b
  )
  SELECT json_build_object(
    'total_ingreso',           SUM(total_ingreso),
    'total_margen_bruto',      SUM(total_margen_bruto),
    'margen_pct_bruto',        ROUND(SUM(total_margen_bruto) / NULLIF(SUM(total_ingreso), 0) * 100, 2),
    'total_aporte',            ROUND(SUM(aporte), 0),
    'total_margen_con_aporte', ROUND(SUM(total_margen_bruto) + SUM(aporte), 0),
    'margen_pct_con_aporte',   ROUND((SUM(total_margen_bruto) + SUM(aporte)) / NULLIF(SUM(total_ingreso), 0) * 100, 2)
  )
  FROM con_aporte;
$$;

-- ============================================================================
-- RPC: get_margen_aporte_por_marca (recalibrado)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_margen_aporte_por_marca(
  p_desde   date DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta   date DEFAULT CURRENT_DATE::date,
  p_tienda  uuid DEFAULT NULL,
  p_canal   text DEFAULT NULL,
  p_region  text DEFAULT NULL
)
RETURNS TABLE(
  marca_id                UUID,
  marca_nombre            TEXT,
  propia                  BOOLEAN,
  total_ingreso           NUMERIC,
  total_margen_bruto      NUMERIC,
  margen_pct_bruto        NUMERIC,
  aporte_pct              NUMERIC,
  total_aporte            NUMERIC,
  total_margen_con_aporte NUMERIC,
  margen_pct_con_aporte   NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH por_marca AS (
    SELECT
      s.marca_id,
      mar.nombre AS marca_nombre,
      mar.propia,
      SUM(m.ingreso) AS total_ingreso,
      SUM(m.margen)  AS total_margen_bruto,
      CASE WHEN SUM(m.ingreso) > 0 THEN SUM(m.margen) / SUM(m.ingreso) * 100 END AS margen_pct_bruto
    FROM public.mv_sku_kpis_mensual m
    JOIN public.skus    s   ON s.id = m.sku_id
    JOIN public.marcas  mar ON mar.id = s.marca_id
    JOIN public.tiendas t   ON t.id = m.tienda_id
    WHERE m.anio_mes BETWEEN p_desde AND p_hasta
      AND (p_tienda IS NULL OR m.tienda_id  = p_tienda)
      AND (p_canal  IS NULL OR t.canal::text = p_canal)
      AND (p_region IS NULL OR t.region     = p_region)
    GROUP BY s.marca_id, mar.nombre, mar.propia
    HAVING SUM(m.ingreso) > 0
  ),
  bounds AS (
    SELECT MIN(margen_pct_bruto) AS min_m, MAX(margen_pct_bruto) AS max_m
    FROM por_marca WHERE NOT propia
  )
  SELECT
    pm.marca_id,
    pm.marca_nombre,
    pm.propia,
    ROUND(pm.total_ingreso, 0)      AS total_ingreso,
    ROUND(pm.total_margen_bruto, 0) AS total_margen_bruto,
    ROUND(pm.margen_pct_bruto, 2)   AS margen_pct_bruto,
    CASE WHEN NOT pm.propia THEN ROUND(public._aporte_pct(pm.margen_pct_bruto, b.min_m, b.max_m) * 100, 1) ELSE 0 END AS aporte_pct,
    CASE WHEN NOT pm.propia THEN ROUND(pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto, b.min_m, b.max_m), 0) ELSE 0 END AS total_aporte,
    ROUND(pm.total_margen_bruto + CASE WHEN NOT pm.propia THEN pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto, b.min_m, b.max_m) ELSE 0 END, 0) AS total_margen_con_aporte,
    ROUND(
      (pm.total_margen_bruto + CASE WHEN NOT pm.propia THEN pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto, b.min_m, b.max_m) ELSE 0 END)
      / NULLIF(pm.total_ingreso, 0) * 100, 2
    ) AS margen_pct_con_aporte
  FROM por_marca pm CROSS JOIN bounds b
  ORDER BY pm.total_ingreso DESC;
$$;

-- ============================================================================
-- RPC: get_margen_aporte_tendencia (recalibrado, bounds por mes)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_margen_aporte_tendencia(
  p_desde  date DEFAULT (CURRENT_DATE - INTERVAL '24 months')::date,
  p_hasta  date DEFAULT CURRENT_DATE::date,
  p_tienda uuid DEFAULT NULL,
  p_marca  uuid DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH por_marca_mes AS (
    SELECT
      m.anio_mes,
      s.marca_id,
      mar.propia,
      SUM(m.ingreso) AS total_ingreso,
      SUM(m.margen)  AS total_margen_bruto,
      CASE WHEN SUM(m.ingreso) > 0 THEN SUM(m.margen) / SUM(m.ingreso) * 100 END AS margen_pct_bruto
    FROM public.mv_sku_kpis_mensual m
    JOIN public.skus   s   ON s.id = m.sku_id
    JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE m.anio_mes BETWEEN p_desde AND p_hasta
      AND (p_tienda IS NULL OR m.tienda_id = p_tienda)
      AND (p_marca  IS NULL OR s.marca_id  = p_marca)
    GROUP BY m.anio_mes, s.marca_id, mar.propia
  ),
  bounds AS (
    SELECT anio_mes, MIN(margen_pct_bruto) AS min_m, MAX(margen_pct_bruto) AS max_m
    FROM por_marca_mes WHERE NOT propia
    GROUP BY anio_mes
  ),
  con_aporte AS (
    SELECT
      pmm.*,
      CASE WHEN NOT pmm.propia
        THEN pmm.total_ingreso * public._aporte_pct(pmm.margen_pct_bruto, b.min_m, b.max_m)
        ELSE 0
      END AS aporte
    FROM por_marca_mes pmm
    JOIN bounds b USING (anio_mes)
  ),
  por_mes AS (
    SELECT
      anio_mes,
      SUM(total_ingreso)      AS total_ingreso,
      SUM(total_margen_bruto) AS total_margen_bruto,
      SUM(aporte)              AS total_aporte
    FROM con_aporte
    GROUP BY anio_mes
  )
  SELECT json_agg(
    json_build_object(
      'anio_mes',               to_char(anio_mes, 'YYYY-MM-DD'),
      'total_ingreso',          ROUND(total_ingreso, 0),
      'total_margen_bruto',     ROUND(total_margen_bruto, 0),
      'margen_pct_bruto',       ROUND(total_margen_bruto / NULLIF(total_ingreso, 0) * 100, 2),
      'total_aporte',           ROUND(total_aporte, 0),
      'total_margen_con_aporte', ROUND(total_margen_bruto + total_aporte, 0),
      'margen_pct_con_aporte',  ROUND((total_margen_bruto + total_aporte) / NULLIF(total_ingreso, 0) * 100, 2)
    )
    ORDER BY anio_mes
  )
  FROM por_mes;
$$;

GRANT EXECUTE ON FUNCTION public._aporte_pct(numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_resumen              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_por_marca            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_tendencia            TO authenticated;
