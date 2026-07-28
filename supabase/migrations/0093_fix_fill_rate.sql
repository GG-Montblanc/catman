-- 0093_fix_fill_rate.sql
-- fill_rate estaba definido como LEAST(dias_stock/30, 1) — pero dias_stock
-- en los datos sinteticos representa "profundidad de inventario en dias"
-- (~ mdi_meses * 30), no "dias que el producto estuvo disponible". Como
-- casi todo SKU tiene mas de un mes de cobertura, esa division siempre
-- daba >= 1 y se saturaba en 100% para practicamente todo el catalogo:
-- el KPI nunca reflejaba disponibilidad real.
--
-- No hay un evento de "quiebre de stock" modelado explicitamente en los
-- datos (no existe una columna de dias sin stock ni de demanda perdida),
-- asi que se estima con la señal que si existe: si stock_fin quedo en 0
-- Y hubo ventas ese mes, se asume que el producto se agoto en algun punto
-- del mes y se aproxima linealmente cuanto duro la cobertura:
--   fill_rate = stock_inicio / unidades_vendidas   (capado en 1)
-- Si stock_fin > 0 el producto nunca se agoto -> fill_rate = 1.
-- Si no hubo ventas: 1 si tenia stock (no se puede saber si falto), 0 si
-- ademas tampoco tenia stock inicial.
--
-- MATERIALIZED VIEW no soporta CREATE OR REPLACE: hay que recrearla.

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
  -- Fill Rate real (estimado): 1 si nunca se agoto; si se agoto, fraccion
  -- del mes cubierta segun cuanto duraba el stock inicial frente a la
  -- demanda real de ese mes.
  CASE
    WHEN i.stock_fin > 0 THEN 1.0
    WHEN v.unidades > 0 THEN LEAST(1.0, ROUND(i.stock_inicio::numeric / v.unidades, 4))
    WHEN i.stock_inicio > 0 THEN 1.0
    ELSE 0.0
  END AS fill_rate,
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
