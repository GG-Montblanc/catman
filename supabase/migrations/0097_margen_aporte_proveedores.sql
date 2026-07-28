-- 0097_margen_aporte_proveedores.sql
-- "Margen con aporte de proveedores": el margen bruto (ingreso - costo) no
-- refleja el fondeo comercial que las marcas de terceros (rebates por
-- volumen, fondos de marketing, descuentos pie de factura) aportan al
-- retailer. No existe ningun dato de proveedores/fondeo en el modelo
-- (marcas.propia es lo unico que distingue marca propia de marca de
-- tercero), asi que no hay forma de "medir" un aporte real — se estima
-- de forma determinística (no aleatoria) a partir de senales que sí
-- existen: solo aplica a marcas de terceros (propia = false), y el %
-- de aporte es mas alto cuanto mas bajo es el margen bruto de la marca
-- (asi funciona en la practica: el proveedor subsidia mas las lineas
-- de menor margen para mantener espacio de gondola). No se persiste
-- en una tabla nueva — se calcula al vuelo en cada RPC a partir de
-- mv_sku_kpis_mensual + marcas.propia, para que quede siempre
-- consistente con los datos reales/actuales sin necesidad de un job
-- de sincronizacion aparte.
--
-- Formula: aporte_pct = clamp(0.10 - margen_pct_marca/100 * 0.20, 0.02, 0.08)
--   margen 50%  -> 0.10-0.10=0.00 -> clamp a 0.02 (piso)
--   margen 30%  -> 0.10-0.06=0.04
--   margen 10%  -> 0.10-0.02=0.08 (techo)
--   margen 0%   -> 0.10-0.00=0.10 -> clamp a 0.08 (techo)
-- Solo se aplica sobre marcas de terceros (propia = false); marca propia
-- no tiene proveedor externo que aporte fondeo comercial.

CREATE OR REPLACE FUNCTION public._aporte_pct(p_margen_pct numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(0.08, GREATEST(0.02, 0.10 - COALESCE(p_margen_pct, 30) / 100.0 * 0.20));
$$;

-- ============================================================================
-- RPC: get_margen_aporte_resumen
-- Totales del período: margen bruto vs. margen con aporte de proveedores
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
  con_aporte AS (
    SELECT
      *,
      CASE WHEN NOT propia THEN total_ingreso * public._aporte_pct(margen_pct_bruto) ELSE 0 END AS aporte
    FROM por_marca
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
-- RPC: get_margen_aporte_por_marca
-- Desglose por marca: margen bruto vs. con aporte, para tabla/ranking
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
  )
  SELECT
    pm.marca_id,
    pm.marca_nombre,
    pm.propia,
    ROUND(pm.total_ingreso, 0)      AS total_ingreso,
    ROUND(pm.total_margen_bruto, 0) AS total_margen_bruto,
    ROUND(pm.margen_pct_bruto, 2)   AS margen_pct_bruto,
    CASE WHEN NOT pm.propia THEN ROUND(public._aporte_pct(pm.margen_pct_bruto) * 100, 1) ELSE 0 END AS aporte_pct,
    CASE WHEN NOT pm.propia THEN ROUND(pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto), 0) ELSE 0 END AS total_aporte,
    ROUND(pm.total_margen_bruto + CASE WHEN NOT pm.propia THEN pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto) ELSE 0 END, 0) AS total_margen_con_aporte,
    ROUND(
      (pm.total_margen_bruto + CASE WHEN NOT pm.propia THEN pm.total_ingreso * public._aporte_pct(pm.margen_pct_bruto) ELSE 0 END)
      / NULLIF(pm.total_ingreso, 0) * 100, 2
    ) AS margen_pct_con_aporte
  FROM por_marca pm
  ORDER BY pm.total_ingreso DESC;
$$;

-- ============================================================================
-- RPC: get_margen_aporte_tendencia
-- Serie mensual: margen bruto vs. con aporte, para gráfico de evolución
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
  con_aporte AS (
    SELECT
      *,
      CASE WHEN NOT propia THEN total_ingreso * public._aporte_pct(margen_pct_bruto) ELSE 0 END AS aporte
    FROM por_marca_mes
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

GRANT EXECUTE ON FUNCTION public._aporte_pct                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_resumen    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_por_marca  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margen_aporte_tendencia  TO authenticated;
