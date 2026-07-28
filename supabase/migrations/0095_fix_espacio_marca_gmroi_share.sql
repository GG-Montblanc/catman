-- 0095_fix_espacio_marca_gmroi_share.sql
-- get_espacio_marca normalizaba el componente de GMROI dividiendo por el
-- MAXIMO ("0.3 * avg_gmroi / MAX(avg_gmroi)"). Eso no reparte un 30% del
-- espacio total: varias marcas pueden estar cada una cerca del maximo al
-- mismo tiempo y cada una "pide" su propio 30%, haciendo que la suma de
-- slots_optimos supere ampliamente el total de slots disponibles (se
-- detecto el mismo problema al construir la version por SKU dentro de un
-- planograma). Se normaliza como PARTICIPACION (avg_gmroi / suma de todos
-- los avg_gmroi), igual que ya se hace con el ingreso, y se excluye del
-- promedio/suma a las marcas sin ingreso real (su gmroi ahi es ruido).

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
  total_ventas AS (SELECT SUM(total_ingreso) AS n FROM por_marca),
  -- Suma de GMROI solo de marcas con ingreso real (evita que el gmroi de
  -- una marca sin ventas infle la participacion de otras).
  suma_gmroi AS (
    SELECT SUM(avg_gmroi) AS n FROM por_marca
    WHERE COALESCE(total_ingreso, 0) > 0 AND avg_gmroi IS NOT NULL
  )
  SELECT
    pm.marca_id,
    mar.nombre                                                         AS marca_nombre,
    pm.slots_actuales,
    ROUND(100.0 * pm.slots_actuales / NULLIF((SELECT n FROM total_slots),0), 2) AS pct_espacio,
    COALESCE(pm.total_ingreso, 0)                                      AS total_ingreso,
    ROUND(100.0 * pm.total_ingreso / NULLIF((SELECT n FROM total_ventas),0), 2) AS pct_ventas,
    COALESCE(pm.avg_gmroi, 0)                                          AS avg_gmroi,
    -- Espacio óptimo: 70% ponderado por participación de ingreso + 30%
    -- por participación de GMROI (ambos reparten el mismo 100%, no una
    -- razón al máximo).
    ROUND(
      (SELECT n FROM total_slots) *
      (0.7 * COALESCE(pm.total_ingreso,0) / NULLIF((SELECT n FROM total_ventas),0) +
       CASE WHEN COALESCE(pm.total_ingreso, 0) > 0
         THEN 0.3 * COALESCE(pm.avg_gmroi,0) / NULLIF((SELECT n FROM suma_gmroi),0)
         ELSE 0
       END)
    , 1) AS slots_optimos
  FROM por_marca pm
  JOIN public.marcas mar ON mar.id = pm.marca_id
  ORDER BY pm.total_ingreso DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.get_espacio_marca TO authenticated;
