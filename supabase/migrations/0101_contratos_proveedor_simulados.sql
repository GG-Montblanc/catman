-- 0101_contratos_proveedor_simulados.sql
-- El aporte de proveedores (0097/0098) se calculaba al vuelo con una sola
-- señal (posición relativa de margen bruto dentro del portafolio). Se
-- reemplaza por una tabla persistida que simula el CONTRATO real de cada
-- marca de tercero, construido a partir de dos señales del mix actual:
--
--   1) Posición de margen bruto en el portafolio (igual que antes) ->
--      determina el aporte TOTAL (2%-8% del ingreso, piso/techo).
--   2) Percentil de ingreso de la marca dentro del portafolio -> determina
--      cómo se reparte ese aporte total entre "rebate por volumen" y
--      "fondo de marketing": marcas más grandes (mayor ingreso) negocian
--      proporcionalmente más fondo de marketing/co-op, marcas chicas casi
--      todo su aporte es rebate simple.
--
-- Al ser una tabla (no una función calculada por período/filtro), el
-- contrato de cada marca queda FIJO — como un contrato real que no
-- cambia mes a mes — y se recalcula solo cuando se llama
-- recalcular_contratos_proveedor() (mismo patrón que refresh_kpi_views).
-- Sigue siendo una simulación (no hay dato real de proveedores), pero
-- ahora es una única fuente de verdad reutilizada por resumen/por-marca/
-- tendencia, en vez de recalcularse con criterios levemente distintos
-- en cada RPC.

CREATE TABLE IF NOT EXISTS public.contrato_proveedor_marca (
  marca_id              UUID PRIMARY KEY REFERENCES public.marcas(id) ON DELETE CASCADE,
  rebate_volumen_pct     NUMERIC(5,2) NOT NULL,
  fondo_marketing_pct    NUMERIC(5,2) NOT NULL,
  aporte_total_pct       NUMERIC(5,2) NOT NULL,
  ingreso_referencia     NUMERIC(14,2) NOT NULL,
  margen_pct_referencia  NUMERIC(5,2),
  criterio               TEXT NOT NULL,
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contrato_proveedor_marca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contrato_proveedor_marca_select" ON public.contrato_proveedor_marca;
CREATE POLICY "contrato_proveedor_marca_select" ON public.contrato_proveedor_marca
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- FUNCIÓN: recalcular_contratos_proveedor
-- (Re)genera el contrato simulado de cada marca de tercero a partir del
-- mix real de los últimos p_meses meses. Llamar tras refrescar la MV.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalcular_contratos_proveedor(p_meses INT DEFAULT 12)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_desde DATE := (SELECT date_trunc('month', COALESCE(MAX(anio_mes), CURRENT_DATE) - ((p_meses - 1) || ' months')::interval)::date FROM public.mv_sku_kpis_mensual);
  v_hasta DATE := (SELECT COALESCE(MAX(anio_mes), CURRENT_DATE) FROM public.mv_sku_kpis_mensual);
BEGIN
  WITH por_marca AS (
    SELECT
      s.marca_id,
      SUM(m.ingreso) AS total_ingreso,
      CASE WHEN SUM(m.ingreso) > 0 THEN SUM(m.margen) / SUM(m.ingreso) * 100 END AS margen_pct_bruto
    FROM public.mv_sku_kpis_mensual m
    JOIN public.skus   s   ON s.id = m.sku_id
    JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE m.anio_mes BETWEEN v_desde AND v_hasta
      AND mar.propia = false
    GROUP BY s.marca_id
    HAVING SUM(m.ingreso) > 0
  ),
  bounds AS (
    SELECT MIN(margen_pct_bruto) AS min_m, MAX(margen_pct_bruto) AS max_m
    FROM por_marca
  ),
  con_percentil AS (
    SELECT
      pm.*,
      (PERCENT_RANK() OVER (ORDER BY pm.total_ingreso))::numeric AS ingreso_percentil,
      CASE
        WHEN (SELECT max_m FROM bounds) > (SELECT min_m FROM bounds)
          THEN 8 - 6 * (pm.margen_pct_bruto - (SELECT min_m FROM bounds)) / ((SELECT max_m FROM bounds) - (SELECT min_m FROM bounds))
        ELSE 5
      END AS aporte_total_pct
    FROM por_marca pm
  ),
  calculado AS (
    SELECT
      marca_id,
      total_ingreso,
      margen_pct_bruto,
      ingreso_percentil,
      ROUND(aporte_total_pct, 2) AS aporte_total_pct,
      ROUND(aporte_total_pct * (0.5 + 0.3 * ingreso_percentil), 2) AS rebate_volumen_pct
    FROM con_percentil
  )
  INSERT INTO public.contrato_proveedor_marca (
    marca_id, rebate_volumen_pct, fondo_marketing_pct, aporte_total_pct,
    ingreso_referencia, margen_pct_referencia, criterio, actualizado_en
  )
  SELECT
    c.marca_id,
    c.rebate_volumen_pct,
    ROUND(c.aporte_total_pct - c.rebate_volumen_pct, 2) AS fondo_marketing_pct,
    c.aporte_total_pct,
    ROUND(c.total_ingreso, 0),
    ROUND(c.margen_pct_bruto, 2),
    format(
      'Margen bruto %s%% (percentil %s%% del portafolio, %s aporte total) + ingreso en percentil %s%% (reparte %s%% a fondo de marketing vs. rebate)',
      ROUND(c.margen_pct_bruto, 1),
      ROUND(100 - 100 * (c.aporte_total_pct - 2) / 6.0, 0),
      ROUND(c.aporte_total_pct, 1) || '%',
      ROUND(c.ingreso_percentil * 100, 0),
      ROUND((1 - (0.5 + 0.3 * c.ingreso_percentil)) * 100, 0)
    ),
    now()
  FROM calculado c
  ON CONFLICT (marca_id) DO UPDATE SET
    rebate_volumen_pct    = EXCLUDED.rebate_volumen_pct,
    fondo_marketing_pct   = EXCLUDED.fondo_marketing_pct,
    aporte_total_pct      = EXCLUDED.aporte_total_pct,
    ingreso_referencia    = EXCLUDED.ingreso_referencia,
    margen_pct_referencia = EXCLUDED.margen_pct_referencia,
    criterio              = EXCLUDED.criterio,
    actualizado_en        = now();

  -- Elimina contratos de marcas que ya no califican (sin ingreso en la ventana)
  DELETE FROM public.contrato_proveedor_marca cpm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.mv_sku_kpis_mensual m
    JOIN public.skus s ON s.id = m.sku_id
    WHERE s.marca_id = cpm.marca_id AND m.anio_mes BETWEEN v_desde AND v_hasta
  );
END;
$$;

-- Poblar de inmediato con el mix actual
SELECT public.recalcular_contratos_proveedor();

-- ============================================================================
-- RPCs de margen con aporte: ahora leen el contrato persistido en vez de
-- recalcular la fórmula al vuelo
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
      SUM(m.margen)  AS total_margen_bruto
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
  con_aporte_final AS (
    SELECT pm.*, CASE WHEN pm.propia THEN 0 ELSE COALESCE(pm.total_ingreso * c.aporte_total_pct / 100.0, 0) END AS aporte
    FROM por_marca pm
    LEFT JOIN public.contrato_proveedor_marca c ON c.marca_id = pm.marca_id
  )
  SELECT json_build_object(
    'total_ingreso',           SUM(total_ingreso),
    'total_margen_bruto',      SUM(total_margen_bruto),
    'margen_pct_bruto',        ROUND(SUM(total_margen_bruto) / NULLIF(SUM(total_ingreso), 0) * 100, 2),
    'total_aporte',            ROUND(SUM(aporte), 0),
    'total_margen_con_aporte', ROUND(SUM(total_margen_bruto) + SUM(aporte), 0),
    'margen_pct_con_aporte',   ROUND((SUM(total_margen_bruto) + SUM(aporte)) / NULLIF(SUM(total_ingreso), 0) * 100, 2)
  )
  FROM con_aporte_final;
$$;

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
  margen_pct_con_aporte   NUMERIC,
  rebate_volumen_pct      NUMERIC,
  fondo_marketing_pct     NUMERIC,
  criterio                TEXT
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
  )
  SELECT
    pm.marca_id,
    pm.marca_nombre,
    pm.propia,
    ROUND(pm.total_ingreso, 0)      AS total_ingreso,
    ROUND(pm.total_margen_bruto, 0) AS total_margen_bruto,
    ROUND(pm.margen_pct_bruto, 2)   AS margen_pct_bruto,
    CASE WHEN pm.propia THEN 0 ELSE COALESCE(c.aporte_total_pct, 0) END AS aporte_pct,
    CASE WHEN pm.propia THEN 0 ELSE ROUND(COALESCE(pm.total_ingreso * c.aporte_total_pct / 100.0, 0), 0) END AS total_aporte,
    ROUND(pm.total_margen_bruto + CASE WHEN pm.propia THEN 0 ELSE COALESCE(pm.total_ingreso * c.aporte_total_pct / 100.0, 0) END, 0) AS total_margen_con_aporte,
    ROUND(
      (pm.total_margen_bruto + CASE WHEN pm.propia THEN 0 ELSE COALESCE(pm.total_ingreso * c.aporte_total_pct / 100.0, 0) END)
      / NULLIF(pm.total_ingreso, 0) * 100, 2
    ) AS margen_pct_con_aporte,
    CASE WHEN pm.propia THEN 0 ELSE COALESCE(c.rebate_volumen_pct, 0) END AS rebate_volumen_pct,
    CASE WHEN pm.propia THEN 0 ELSE COALESCE(c.fondo_marketing_pct, 0) END AS fondo_marketing_pct,
    CASE WHEN pm.propia THEN 'Marca propia — sin contrato de proveedor externo' ELSE c.criterio END AS criterio
  FROM por_marca pm
  LEFT JOIN public.contrato_proveedor_marca c ON c.marca_id = pm.marca_id
  ORDER BY pm.total_ingreso DESC;
$$;

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
      SUM(m.margen)  AS total_margen_bruto
    FROM public.mv_sku_kpis_mensual m
    JOIN public.skus   s   ON s.id = m.sku_id
    JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE m.anio_mes BETWEEN p_desde AND p_hasta
      AND (p_tienda IS NULL OR m.tienda_id = p_tienda)
      AND (p_marca  IS NULL OR s.marca_id  = p_marca)
    GROUP BY m.anio_mes, s.marca_id, mar.propia
  ),
  con_aporte AS (
    SELECT
      pmm.*,
      CASE WHEN pmm.propia THEN 0 ELSE COALESCE(pmm.total_ingreso * c.aporte_total_pct / 100.0, 0) END AS aporte
    FROM por_marca_mes pmm
    LEFT JOIN public.contrato_proveedor_marca c ON c.marca_id = pmm.marca_id
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

-- Ya no se usa: el aporte ahora se lee del contrato persistido
DROP FUNCTION IF EXISTS public._aporte_pct(numeric, numeric, numeric);

-- refresh_kpi_views recalcula tambien los contratos de proveedor simulados,
-- para que ambas simulaciones (fill rate en la MV, aporte en esta tabla)
-- se mantengan sincronizadas con el mismo refresco.
CREATE OR REPLACE FUNCTION public.refresh_kpi_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sku_kpis_mensual;
  PERFORM public.recalcular_contratos_proveedor();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_contratos_proveedor TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_resumen      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_por_marca    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_tendencia    TO authenticated;
GRANT SELECT  ON public.contrato_proveedor_marca                TO authenticated;
