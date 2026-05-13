-- 0081_mejoras_alertas_y_asignaciones.sql
-- 1. Extiende get_alertas_dashboard para soportar filtro por tipo
-- 2. Agrega RPC get_tiendas_asignadas(p_planograma_id) para el sheet de asignación
-- 3. Agrega columna imagen_url en planograma_asignaciones si no existe (info visual)

-- ─── 1. get_alertas_por_tipo ──────────────────────────────────────────────────
-- Versión filtrable por tipo de alerta y severidad

CREATE OR REPLACE FUNCTION public.get_alertas_filtradas(
  p_limit      INT     DEFAULT 200,
  p_tipo       TEXT    DEFAULT NULL,   -- 'dog' | 'sobrestock' | 'quiebre_riesgo' | 'obsoleto' | NULL (todos)
  p_severidad  INT     DEFAULT NULL    -- 1 | 2 | 3 | NULL (todos)
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
  imagen_url     TEXT
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
  alertas AS (
    SELECT k.sku_id, 'dog'::TEXT AS tipo, 1 AS sev,
           'GMROI bajo y rotación lenta — candidato a liquidación' AS desc_,
           k.avg_gmroi, k.avg_mdi
    FROM kpis k
    WHERE k.avg_gmroi IS NOT NULL AND k.avg_gmroi < 0.5
      AND k.avg_sellthru IS NOT NULL AND k.avg_sellthru < 30

    UNION ALL

    SELECT k.sku_id, 'sobrestock'::TEXT,
           CASE WHEN k.avg_mdi > 12 THEN 1 ELSE 2 END,
           CASE WHEN k.avg_mdi > 12
             THEN 'Inventario crítico > 12 meses — revisar descontinuación'
             ELSE 'Inventario elevado (9–12 meses) — reducir próxima compra'
           END,
           k.avg_gmroi, k.avg_mdi
    FROM kpis k WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi > 9

    UNION ALL

    SELECT k.sku_id, 'quiebre_riesgo'::TEXT, 1,
           'Fill rate bajo y stock escaso — riesgo de quiebre inminente',
           k.avg_gmroi, k.avg_mdi
    FROM kpis k
    WHERE k.avg_fill_rate IS NOT NULL AND k.avg_fill_rate < 60
      AND k.avg_mdi IS NOT NULL AND k.avg_mdi < 1
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi > 0.8

    UNION ALL

    SELECT k.sku_id, 'obsoleto'::TEXT, 2,
           'GMROI aceptable pero inventario obsoleto — evaluar promoción agresiva',
           k.avg_gmroi, k.avg_mdi
    FROM kpis k
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi BETWEEN 6 AND 9
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi < 1.0
  ),
  ranked AS (
    SELECT DISTINCT ON (a.sku_id)
      a.sku_id, a.tipo, a.sev, a.desc_, a.avg_gmroi, a.avg_mdi
    FROM alertas a
    ORDER BY a.sku_id, a.sev ASC
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
    s.imagen_url
  FROM ranked r
  JOIN public.skus     s   ON s.id   = r.sku_id
  LEFT JOIN public.marcas mar ON mar.id = s.marca_id
  WHERE s.activo = true
    AND (p_tipo IS NULL     OR r.tipo  = p_tipo)
    AND (p_severidad IS NULL OR r.sev  = p_severidad)
  ORDER BY r.sev ASC, r.avg_mdi DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_alertas_filtradas TO authenticated;

-- ─── 2. get_tiendas_asignadas ─────────────────────────────────────────────────
-- Devuelve las tiendas asignadas a un planograma con detalle

CREATE OR REPLACE FUNCTION public.get_tiendas_asignadas(p_planograma_id UUID)
RETURNS TABLE (
  tienda_id      UUID,
  tienda_nombre  TEXT,
  ciudad         TEXT,
  formato        TEXT,
  activa         BOOLEAN,
  fecha_desde    DATE,
  fecha_hasta    DATE
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.id          AS tienda_id,
    t.nombre      AS tienda_nombre,
    t.ciudad,
    t.formato,
    pa.activa,
    pa.fecha_desde,
    pa.fecha_hasta
  FROM public.planograma_asignaciones pa
  JOIN public.tiendas t ON t.id = pa.tienda_id
  WHERE pa.planograma_id = p_planograma_id
    AND pa.activa = TRUE
  ORDER BY t.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.get_tiendas_asignadas(UUID) TO authenticated;

-- ─── 3. planograma_tiendas — tabla simple planograma ↔ tienda ─────────────────
-- La tabla planograma_asignaciones de 0080 está pensada para templates y tiene
-- template_id NOT NULL. Para el UI de "asignar planograma a tiendas" necesitamos
-- una tabla más simple donde la FK principal es planograma_id.

CREATE TABLE IF NOT EXISTS public.planograma_tiendas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planograma_id  UUID NOT NULL REFERENCES public.planogramas(id) ON DELETE CASCADE,
  tienda_id      UUID NOT NULL REFERENCES public.tiendas(id)     ON DELETE CASCADE,
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (planograma_id, tienda_id)
);

CREATE INDEX IF NOT EXISTS idx_planograma_tiendas_plan   ON public.planograma_tiendas(planograma_id);
CREATE INDEX IF NOT EXISTS idx_planograma_tiendas_tienda ON public.planograma_tiendas(tienda_id);

ALTER TABLE public.planograma_tiendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read planograma_tiendas"
  ON public.planograma_tiendas FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "auth write planograma_tiendas"
  ON public.planograma_tiendas FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Actualizar get_planogramas_lista para contar desde la nueva tabla
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
  total_ingreso         numeric,
  n_tiendas_asignadas   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH slot_kpis AS (
    SELECT
      ps.planograma_id,
      COUNT(DISTINCT ps.id)   AS slot_count,
      AVG(k.gmroi)            AS avg_gmroi,
      AVG(k.sellthru_pct)     AS avg_sellthru,
      AVG(k.margen_pct)       AS avg_margen_pct,
      SUM(k.ingreso)          AS total_ingreso
    FROM public.planograma_slots ps
    JOIN public.planogramas pl ON pl.id = ps.planograma_id
    JOIN public.mv_sku_kpis_mensual k
      ON  k.sku_id    = ps.sku_id
      AND k.tienda_id = pl.tienda_id
      AND k.anio_mes >= (CURRENT_DATE - INTERVAL '6 months')
    GROUP BY ps.planograma_id
  ),
  tiendas_cnt AS (
    SELECT planograma_id, COUNT(*) AS n_tiendas
    FROM public.planograma_tiendas
    WHERE activa = TRUE
    GROUP BY planograma_id
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
    COALESCE(sk.slot_count, 0)  AS slot_count,
    sk.avg_gmroi,
    sk.avg_sellthru,
    sk.avg_margen_pct,
    sk.total_ingreso,
    COALESCE(tc.n_tiendas, 0)   AS n_tiendas_asignadas
  FROM public.planogramas p
  JOIN public.tiendas     t ON t.id = p.tienda_id
  JOIN public.categorias  c ON c.id = p.categoria_id
  LEFT JOIN slot_kpis sk ON sk.planograma_id = p.id
  LEFT JOIN tiendas_cnt tc ON tc.planograma_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_planogramas_lista() TO authenticated;
