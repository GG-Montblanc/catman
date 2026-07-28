-- 0094_simular_fill_rate.sql
-- Los datos sinteticos nunca modelan un quiebre de stock real: stock_fin
-- jamas llega a 0 en ninguna de las 210.024 filas de inventario_fact.
-- Por construccion, unidades vendidas siempre esta acotada por lo que
-- habia disponible (demanda censurada) -> CUALQUIER formula que compare
-- oferta vs demanda realizada da siempre >= 100%. No es arreglable con
-- una formula distinta sobre estas columnas.
--
-- Se opta por SIMULAR fill_rate de forma deterministica (no al azar):
-- se deriva de mdi_meses (que si tiene variacion real) asumiendo que a
-- menor cobertura de stock, mayor la chance de que haya quedado algo de
-- demanda sin satisfacer ese mes. Es una estimacion de ejemplo, no una
-- medicion real de quiebres — se documenta como tal.
--
--   fill_rate = mdi_meses / 2.5, acotado entre 0.4 y 1.0
--   (2.5 meses de cobertura o mas -> fill rate pleno; menos de eso,
--    decae linealmente hasta un piso de 40%)

DROP MATERIALIZED VIEW IF EXISTS public.mv_sku_kpis_mensual;

CREATE MATERIALIZED VIEW public.mv_sku_kpis_mensual AS
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
  CASE WHEN i.costo_inventario > 0
    THEN ROUND((v.margen / i.costo_inventario * 12)::numeric, 4)
  END AS gmroi,
  CASE WHEN v.unidades_recibidas > 0
    THEN ROUND((v.unidades::numeric / v.unidades_recibidas * 100)::numeric, 2)
  END AS sellthru_pct,
  CASE WHEN i.stock_inicio > 0
    THEN ROUND((v.unidades::numeric / i.stock_inicio)::numeric, 4)
  END AS sell_to_stock,
  -- Fill Rate SIMULADO (ver comentario arriba): los datos no modelan
  -- quiebres reales, se deriva de mdi_meses de forma deterministica.
  LEAST(1.0, GREATEST(0.4, ROUND((i.mdi_meses / 2.5)::numeric, 4))) AS fill_rate,
  CASE WHEN v.ingreso > 0
    THEN ROUND((v.margen / v.ingreso * 100)::numeric, 2)
  END AS margen_pct
FROM public.ventas_fact v
JOIN public.inventario_fact i USING (sku_id, tienda_id, anio_mes)
WITH DATA;

CREATE UNIQUE INDEX idx_mv_kpis_pk
  ON public.mv_sku_kpis_mensual (sku_id, tienda_id, anio_mes);
CREATE INDEX idx_mv_kpis_mes
  ON public.mv_sku_kpis_mensual (anio_mes DESC);
CREATE INDEX idx_mv_kpis_gmroi
  ON public.mv_sku_kpis_mensual (gmroi DESC NULLS LAST);
CREATE INDEX idx_mv_kpis_sku_mes
  ON public.mv_sku_kpis_mensual (sku_id, anio_mes DESC);
CREATE INDEX idx_mv_kpis_tienda_mes
  ON public.mv_sku_kpis_mensual (tienda_id, anio_mes DESC);

GRANT SELECT ON public.mv_sku_kpis_mensual TO authenticated;
