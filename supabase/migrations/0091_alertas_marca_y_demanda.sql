-- 0091_alertas_marca_y_demanda.sql
-- 1. Agrega patron_demanda (Smooth/Erratic/Intermittent/Lumpy, metodo ADI/CV2)
--    a get_alertas_filtradas.
-- 2. get_alertas_dashboard (usado por el panel del Dashboard) queda como un
--    wrapper de get_alertas_filtradas en vez de duplicar la logica de
--    umbrales con los cortes absolutos originales (que nunca se cumplian).

CREATE OR REPLACE FUNCTION public.get_alertas_filtradas(
  p_limit      INT     DEFAULT 200,
  p_tipo       TEXT    DEFAULT NULL,
  p_severidad  INT     DEFAULT NULL
)
RETURNS TABLE (
  sku_id         UUID,
  sku_nombre     TEXT,
  marca_nombre   TEXT,
  tipo_alerta    TEXT,
  severidad      INT,
  descripcion    TEXT,
  valor_gmroi    NUMERIC,
  valor_mdi      NUMERIC,
  imagen_url     TEXT,
  patron_demanda TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  kpis AS (
    SELECT
      m.sku_id,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL),    2) AS avg_sellthru,
      ROUND(AVG(m.mdi_meses)    FILTER (WHERE m.mdi_meses IS NOT NULL),       2) AS avg_mdi,
      ROUND(AVG(m.fill_rate)    FILTER (WHERE m.fill_rate IS NOT NULL),       2) AS avg_fill_rate
    FROM public.mv_sku_kpis_mensual m
    WHERE m.anio_mes >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months')::DATE
    GROUP BY m.sku_id
  ),
  percentiles AS (
    SELECT
      PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY avg_gmroi)    AS gmroi_p10,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_gmroi)    AS gmroi_p50,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_sellthru) AS sellthru_p25,
      PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY avg_mdi)      AS mdi_p10,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_mdi)      AS mdi_p75,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_mdi)      AS mdi_p90
    FROM kpis
  ),
  alertas AS (
    SELECT k.sku_id, 'dog'::TEXT AS tipo, 1 AS sev,
           'GMROI en el 10% más bajo del portafolio y baja rotación — candidato a liquidación' AS desc_,
           k.avg_gmroi, k.avg_mdi
    FROM kpis k, percentiles p
    WHERE k.avg_gmroi IS NOT NULL AND k.avg_gmroi <= p.gmroi_p10
      AND k.avg_sellthru IS NOT NULL AND k.avg_sellthru <= p.sellthru_p25

    UNION ALL

    SELECT k.sku_id, 'sobrestock'::TEXT,
           CASE WHEN k.avg_mdi > p.mdi_p90 THEN 1 ELSE 2 END,
           CASE WHEN k.avg_mdi > p.mdi_p90
             THEN 'Inventario en el 10% más alto del portafolio — revisar descontinuación'
             ELSE 'Inventario en el 25% más alto del portafolio — reducir próxima compra'
           END,
           k.avg_gmroi, k.avg_mdi
    FROM kpis k, percentiles p
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi > p.mdi_p75

    UNION ALL

    SELECT k.sku_id, 'quiebre_riesgo'::TEXT, 1,
           'Cobertura de stock en el 10% más baja del portafolio con buena rotación — riesgo de quiebre',
           k.avg_gmroi, k.avg_mdi
    FROM kpis k, percentiles p
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi <= p.mdi_p10
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi >= p.gmroi_p50

    UNION ALL

    SELECT k.sku_id, 'obsoleto'::TEXT, 2,
           'GMROI bajo el promedio del portafolio con inventario elevado — evaluar promoción',
           k.avg_gmroi, k.avg_mdi
    FROM kpis k, percentiles p
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi BETWEEN p.mdi_p75 AND p.mdi_p90
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi < p.gmroi_p50
  ),
  ranked AS (
    SELECT DISTINCT ON (a.sku_id)
      a.sku_id, a.tipo, a.sev, a.desc_, a.avg_gmroi, a.avg_mdi
    FROM alertas a
    ORDER BY a.sku_id, a.sev ASC
  ),
  -- Clasificación de patrón de demanda (ADI / CV², método Syntetos-Boylan)
  -- sobre los últimos 12 meses, mismo cálculo que se usa en el detalle del SKU.
  meses AS (
    SELECT generate_series(
      (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months')::date,
      DATE_TRUNC('month', CURRENT_DATE)::date,
      '1 month'::interval
    )::date AS mes
  ),
  ventas_mensuales AS (
    SELECT r.sku_id, me.mes, COALESCE(SUM(v.unidades), 0) AS unidades
    FROM ranked r
    CROSS JOIN meses me
    LEFT JOIN public.ventas_fact v
      ON v.sku_id = r.sku_id AND v.anio_mes = me.mes
    GROUP BY r.sku_id, me.mes
  ),
  demanda_stats AS (
    SELECT
      sku_id,
      COUNT(*)                               AS n_periodos,
      COUNT(*) FILTER (WHERE unidades > 0)   AS n_con_demanda,
      AVG(unidades)    FILTER (WHERE unidades > 0) AS media_demanda,
      STDDEV_POP(unidades) FILTER (WHERE unidades > 0) AS stddev_demanda
    FROM ventas_mensuales
    GROUP BY sku_id
  ),
  clasificacion AS (
    SELECT
      sku_id,
      CASE
        WHEN n_con_demanda = 0 THEN 'intermittent'
        WHEN (n_periodos::numeric / n_con_demanda) < 1.32
         AND POWER(COALESCE(stddev_demanda, 0) / NULLIF(media_demanda, 0), 2) < 0.49
          THEN 'smooth'
        WHEN (n_periodos::numeric / n_con_demanda) < 1.32
          THEN 'erratic'
        WHEN POWER(COALESCE(stddev_demanda, 0) / NULLIF(media_demanda, 0), 2) < 0.49
          THEN 'intermittent'
        ELSE 'lumpy'
      END AS patron_demanda
    FROM demanda_stats
  )
  SELECT
    r.sku_id,
    s.nombre         AS sku_nombre,
    mar.nombre       AS marca_nombre,
    r.tipo           AS tipo_alerta,
    r.sev            AS severidad,
    r.desc_          AS descripcion,
    r.avg_gmroi      AS valor_gmroi,
    r.avg_mdi        AS valor_mdi,
    s.imagen_url,
    c.patron_demanda
  FROM ranked r
  JOIN public.skus     s   ON s.id   = r.sku_id
  LEFT JOIN public.marcas mar ON mar.id = s.marca_id
  LEFT JOIN clasificacion c ON c.sku_id = r.sku_id
  WHERE s.activo = true
    AND (p_tipo IS NULL     OR r.tipo  = p_tipo)
    AND (p_severidad IS NULL OR r.sev  = p_severidad)
  ORDER BY r.sev ASC, r.avg_mdi DESC NULLS LAST
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_alertas_filtradas TO authenticated;

-- get_alertas_dashboard: ahora delega en get_alertas_filtradas para no
-- mantener dos copias de los umbrales (la copia vieja usaba cortes fijos
-- que este dataset nunca alcanza, por eso el panel del Dashboard siempre
-- mostraba "Sin alertas").
CREATE OR REPLACE FUNCTION public.get_alertas_dashboard(
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  sku_id         UUID,
  sku_nombre     TEXT,
  marca_nombre   TEXT,
  tipo_alerta    TEXT,
  severidad      INT,
  descripcion    TEXT,
  valor_gmroi    NUMERIC,
  valor_mdi      NUMERIC,
  imagen_url     TEXT,
  patron_demanda TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM public.get_alertas_filtradas(p_limit, NULL, NULL);
$$;
GRANT EXECUTE ON FUNCTION public.get_alertas_dashboard TO authenticated;
