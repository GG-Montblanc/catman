-- 0079_tiendas_kpis_con_direccion.sql
-- Agrega el campo direccion al RPC get_tiendas_kpis (añadido en 0078)

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
  direccion      TEXT,
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
    t.canal::TEXT,
    t.formato::TEXT,
    t.direccion,
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
