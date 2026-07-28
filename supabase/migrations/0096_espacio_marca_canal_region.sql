-- 0096_espacio_marca_canal_region.sql
-- get_espacio_marca solo filtraba por planograma o tienda puntual. Se
-- agregan p_canal y p_region (nuevos parametros al final, con DEFAULT
-- NULL — no rompe llamadas existentes) para poder ver el espacio optimo
-- agregado por canal (mall/calle/outlet) o por region completa.
--
-- De paso se corrige un bug real que aparece al agregar mas de una
-- tienda a la vez (algo que antes casi no pasaba, porque solo se podia
-- filtrar por 1 tienda puntual o por todo el portafolio): el LATERAL
-- que trae ingreso/gmroi por SKU solo filtraba por sku_id, no por
-- tienda_id, asi que si un SKU aparecia en slots de varias tiendas
-- filtradas, su ingreso (de TODAS las tiendas, no solo esa) se sumaba
-- una vez por cada aparicion — inflando el total. Se agrega el filtro
-- de tienda_id que faltaba.
--
-- Nota: el cambio de firma (3 args -> 5 args) hace que CREATE OR REPLACE
-- cree un OVERLOAD nuevo en vez de reemplazar la funcion vieja de 3
-- args (Postgres identifica funciones por nombre + tipos de argumentos).
-- Eso dejaba dos "get_espacio_marca" coexistiendo y el GRANT sin lista
-- de argumentos fallaba por ambiguo. Se elimina explicitamente la
-- version vieja de 3 args antes de crear la nueva.

DROP FUNCTION IF EXISTS public.get_espacio_marca(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_espacio_marca(
  p_planograma_id UUID DEFAULT NULL,
  p_tienda_id     UUID DEFAULT NULL,
  p_categoria_id  UUID DEFAULT NULL,
  p_canal         TEXT DEFAULT NULL,
  p_region        TEXT DEFAULT NULL
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
    JOIN public.tiendas     t ON t.id = p.tienda_id
    WHERE (p_planograma_id IS NULL OR p.id = p_planograma_id)
      AND (p_tienda_id     IS NULL OR p.tienda_id = p_tienda_id)
      AND (p_categoria_id  IS NULL OR p.categoria_id = p_categoria_id)
      AND (p_canal         IS NULL OR t.canal::text = p_canal)
      AND (p_region        IS NULL OR t.region = p_region)
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
        AND vf.tienda_id = sf.tienda_id
        AND vf.anio_mes >= date_trunc('month', CURRENT_DATE - '3 months'::interval)::date
    ) m3 ON true
    GROUP BY s.marca_id
  ),
  total_ventas AS (SELECT SUM(total_ingreso) AS n FROM por_marca),
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
GRANT EXECUTE ON FUNCTION public.get_espacio_marca(UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
