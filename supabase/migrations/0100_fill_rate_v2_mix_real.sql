-- 0100_fill_rate_v2_mix_real.sql
-- Fill rate simulado (0094) solo usaba mdi_meses. Se enriquece con una
-- segunda señal real que YA existe en la misma vista pero no se estaba
-- usando: sell_to_stock (velocidad de venta relativa al stock inicial
-- del mes). Un SKU puede tener MDI aceptable en promedio pero venderse
-- muy rápido dentro del mes (sell_to_stock alto) — eso también es señal
-- de riesgo real de quiebre, independiente de la cobertura promedio.
--
-- Se toma el peor de los dos escenarios (MIN), no un promedio, porque
-- cualquiera de las dos señales por sí sola ya indica riesgo real:
--   fill_por_mdi      = mdi_meses / 2.5, piso 0.4
--   fill_por_velocidad = 1.3 - sell_to_stock, piso 0.5
--   fill_rate = MIN(fill_por_mdi, fill_por_velocidad), acotado a [0.4, 1.0]
--
-- Sigue siendo una SIMULACION (el dataset no registra quiebres reales),
-- pero ahora responde a dos comportamientos reales distintos de cada
-- SKU/tienda/mes (cobertura de inventario Y velocidad de venta) en vez
-- de solo uno — más fiel al mix real de cada producto.

DROP MATERIALIZED VIEW IF EXISTS public.mv_sku_kpis_mensual;

CREATE MATERIALIZED VIEW public.mv_sku_kpis_mensual AS
WITH base AS (
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
    CASE WHEN v.ingreso > 0
      THEN ROUND((v.margen / v.ingreso * 100)::numeric, 2)
    END AS margen_pct
  FROM public.ventas_fact v
  JOIN public.inventario_fact i USING (sku_id, tienda_id, anio_mes)
)
SELECT
  sku_id, tienda_id, anio_mes, unidades, unidades_recibidas, ingreso, costo, margen,
  stock_inicio, stock_fin, stock_promedio, costo_inventario, dias_stock, mdi_meses,
  gmroi, sellthru_pct, sell_to_stock,
  -- Fill Rate SIMULADO v2 — combina cobertura (MDI) y velocidad (sell_to_stock).
  LEAST(1.0, GREATEST(0.4, LEAST(
    ROUND((mdi_meses / 2.5)::numeric, 4),
    ROUND((1.3 - COALESCE(sell_to_stock, 0)) ::numeric, 4)
  ))) AS fill_rate,
  margen_pct
FROM base
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
