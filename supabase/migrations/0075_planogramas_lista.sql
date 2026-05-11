-- 0075_planogramas_lista.sql
-- RPC: get_planogramas_lista — returns planograms with KPI summary for the list view

CREATE OR REPLACE FUNCTION public.get_planogramas_lista()
RETURNS TABLE (
  id                    uuid,
  nombre                text,
  n_bandejas            smallint,
  n_posiciones          smallint,
  fecha_vigencia_desde  date,
  fecha_vigencia_hasta  date,
  tienda_id             uuid,
  tienda_nombre         text,
  tienda_ciudad         text,
  categoria_nombre      text,
  created_at            timestamptz,
  slot_count            bigint,
  avg_gmroi             numeric,
  avg_sellthru          numeric,
  avg_margen_pct        numeric,
  total_ingreso         numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH slot_kpis AS (
    SELECT
      ps.planograma_id,
      COUNT(DISTINCT ps.id)                                   AS slot_count,
      AVG(k.gmroi)                                            AS avg_gmroi,
      AVG(k.sellthru_pct)                                     AS avg_sellthru,
      AVG(k.margen_pct)                                       AS avg_margen_pct,
      SUM(k.ingreso)                                          AS total_ingreso
    FROM public.planograma_slots ps
    JOIN public.planogramas pl ON pl.id = ps.planograma_id
    JOIN public.mv_sku_kpis_mensual k
      ON  k.sku_id   = ps.sku_id
      AND k.tienda_id = pl.tienda_id
      AND k.anio_mes >= (CURRENT_DATE - INTERVAL '6 months')
    GROUP BY ps.planograma_id
  )
  SELECT
    p.id,
    p.nombre,
    p.n_bandejas,
    p.n_posiciones,
    p.fecha_vigencia_desde,
    p.fecha_vigencia_hasta,
    p.tienda_id,
    t.nombre          AS tienda_nombre,
    t.ciudad          AS tienda_ciudad,
    c.nombre          AS categoria_nombre,
    p.created_at,
    COALESCE(sk.slot_count, 0)   AS slot_count,
    sk.avg_gmroi,
    sk.avg_sellthru,
    sk.avg_margen_pct,
    sk.total_ingreso
  FROM public.planogramas p
  JOIN public.tiendas     t ON t.id = p.tienda_id
  JOIN public.categorias  c ON c.id = p.categoria_id
  LEFT JOIN slot_kpis sk ON sk.planograma_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_planogramas_lista() TO authenticated;
