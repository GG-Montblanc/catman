-- 0070_alertas.sql
-- RPC: get_alertas_dashboard
-- Genera alertas accionables desde mv_sku_kpis_mensual + inventario_fact
-- sin requerir que forecast_sku esté poblado.
-- Retorna las N alertas más críticas, ordenadas por severidad.

CREATE OR REPLACE FUNCTION public.get_alertas_dashboard(
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  sku_id         UUID,
  sku_nombre     TEXT,
  marca_nombre   TEXT,
  tipo_alerta    TEXT,   -- 'dog' | 'sobrestock' | 'quiebre_riesgo' | 'obsoleto'
  severidad      INT,    -- 1=alta 2=media 3=baja
  descripcion    TEXT,
  valor_gmroi    NUMERIC,
  valor_mdi      NUMERIC,
  imagen_url     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  -- Última métrica por SKU (promedio últimos 6 meses)
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
  -- Alertas calculadas con prioridad
  alertas AS (
    -- Dogs: GMROI < 0.5 AND Sellthru < 30%
    SELECT
      k.sku_id,
      'dog'::TEXT                     AS tipo,
      1                               AS sev,
      'GMROI bajo y rotación lenta — candidato a liquidación' AS desc_,
      k.avg_gmroi,
      k.avg_mdi
    FROM kpis k
    WHERE k.avg_gmroi IS NOT NULL AND k.avg_gmroi < 0.5
      AND k.avg_sellthru IS NOT NULL AND k.avg_sellthru < 30

    UNION ALL

    -- Sobrestock crítico: MDI > 9 meses
    SELECT
      k.sku_id,
      'sobrestock'::TEXT,
      CASE WHEN k.avg_mdi > 12 THEN 1 ELSE 2 END,
      CASE WHEN k.avg_mdi > 12
        THEN 'Inventario crítico > 12 meses — revisar descontinuación'
        ELSE 'Inventario elevado (9–12 meses) — reducir próxima compra'
      END,
      k.avg_gmroi,
      k.avg_mdi
    FROM kpis k
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi > 9

    UNION ALL

    -- Quiebre de stock inminente: fill_rate < 60% y MDI < 1 mes
    SELECT
      k.sku_id,
      'quiebre_riesgo'::TEXT,
      1,
      'Fill rate bajo y stock escaso — riesgo de quiebre inminente',
      k.avg_gmroi,
      k.avg_mdi
    FROM kpis k
    WHERE k.avg_fill_rate IS NOT NULL AND k.avg_fill_rate < 60
      AND k.avg_mdi IS NOT NULL AND k.avg_mdi < 1
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi > 0.8  -- SKU valioso en riesgo

    UNION ALL

    -- Obsoleto con GMROI decente pero sobrestock: señal mixta
    SELECT
      k.sku_id,
      'obsoleto'::TEXT,
      2,
      'GMROI aceptable pero inventario obsoleto — evaluar promoción agresiva',
      k.avg_gmroi,
      k.avg_mdi
    FROM kpis k
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi BETWEEN 6 AND 9
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi < 1.0
  ),
  -- Deduplicar: si un SKU tiene múltiples alertas, mostrar la más severa
  ranked AS (
    SELECT DISTINCT ON (a.sku_id)
      a.sku_id,
      a.tipo,
      a.sev,
      a.desc_,
      a.avg_gmroi,
      a.avg_mdi
    FROM alertas a
    ORDER BY a.sku_id, a.sev ASC
  )
  SELECT
    r.sku_id,
    s.nombre            AS sku_nombre,
    mar.nombre          AS marca_nombre,
    r.tipo              AS tipo_alerta,
    r.sev               AS severidad,
    r.desc_             AS descripcion,
    r.avg_gmroi         AS valor_gmroi,
    r.avg_mdi           AS valor_mdi,
    s.imagen_url
  FROM ranked r
  JOIN public.skus     s   ON s.id   = r.sku_id
  LEFT JOIN public.marcas mar ON mar.id = s.marca_id
  WHERE s.activo = true
  ORDER BY r.sev ASC, r.avg_mdi DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_alertas_dashboard TO authenticated;
