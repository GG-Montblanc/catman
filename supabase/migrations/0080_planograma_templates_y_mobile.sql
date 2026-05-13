-- 0080_planograma_templates_y_mobile.sql
-- Templates de planogramas (se asignan a N tiendas del mismo formato)
-- Vista móvil RPC + conexión con pedidos sugeridos

-- ─── 1. Templates ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planograma_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  formato     TEXT,                    -- 'DBS Beauty Store' | 'Tiendas MakeUp' | 'Prismology'
  categoria_id UUID REFERENCES public.categorias(id),
  n_bandejas   SMALLINT NOT NULL DEFAULT 5,
  n_posiciones SMALLINT NOT NULL DEFAULT 10,
  descripcion  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Slots del template ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planograma_template_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.planograma_templates(id) ON DELETE CASCADE,
  bandeja     SMALLINT NOT NULL,
  posicion    SMALLINT NOT NULL,
  sku_id      UUID REFERENCES public.skus(id),
  frente      SMALLINT NOT NULL DEFAULT 1,
  UNIQUE (template_id, bandeja, posicion)
);

-- ─── 3. Asignaciones template → tienda ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planograma_asignaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES public.planograma_templates(id) ON DELETE CASCADE,
  tienda_id    UUID NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  planograma_id UUID REFERENCES public.planogramas(id),  -- instancia derivada (opcional)
  fecha_desde  DATE,
  fecha_hasta  DATE,
  activa       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, tienda_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_planograma_asignaciones_tienda    ON public.planograma_asignaciones(tienda_id);
CREATE INDEX IF NOT EXISTS idx_planograma_asignaciones_template  ON public.planograma_asignaciones(template_id);
CREATE INDEX IF NOT EXISTS idx_planograma_template_slots_tmpl    ON public.planograma_template_slots(template_id);

-- RLS
ALTER TABLE public.planograma_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planograma_template_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planograma_asignaciones    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read templates"      ON public.planograma_templates      FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth read template_slots" ON public.planograma_template_slots FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth read asignaciones"   ON public.planograma_asignaciones   FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth write templates"     ON public.planograma_templates      FOR ALL    TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth write template_slots" ON public.planograma_template_slots FOR ALL   TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth write asignaciones"  ON public.planograma_asignaciones   FOR ALL    TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─── 4. RPC para vista móvil ─────────────────────────────────────────────────
-- Devuelve el planograma completo para la vista móvil de la tienda
CREATE OR REPLACE FUNCTION public.get_planograma_mobile(p_planograma_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'planograma', jsonb_build_object(
      'id',                  pl.id,
      'nombre',              pl.nombre,
      'n_bandejas',          pl.n_bandejas,
      'n_posiciones',        pl.n_posiciones,
      'fecha_vigencia_desde',pl.fecha_vigencia_desde,
      'fecha_vigencia_hasta',pl.fecha_vigencia_hasta
    ),
    'tienda', jsonb_build_object(
      'id',       t.id,
      'nombre',   t.nombre,
      'ciudad',   t.ciudad,
      'formato',  t.formato,
      'direccion',t.direccion
    ),
    'categoria', jsonb_build_object(
      'id',     c.id,
      'nombre', c.nombre
    ),
    'bandejas', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'bandeja',   ps.bandeja,
          'posicion',  ps.posicion,
          'frente',    COALESCE(ps.frente, 1),
          'sku', jsonb_build_object(
            'id',         s.id,
            'nombre',     s.nombre,
            'marca',      m.nombre,
            'imagen_url', s.imagen_url,
            'precio_lista', s.precio_lista,
            'precio_oferta',s.precio_oferta
          ),
          'kpis', (
            SELECT jsonb_build_object(
              'avg_gmroi',    ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2),
              'avg_sellthru', ROUND(AVG(k.sellthru_pct), 2),
              'total_ingreso',ROUND(SUM(k.ingreso), 0),
              'avg_mdi',      ROUND(AVG(k.mdi_meses), 2)
            )
            FROM public.mv_sku_kpis_mensual k
            WHERE k.sku_id = ps.sku_id
              AND k.tienda_id = pl.tienda_id
              AND k.anio_mes >= CURRENT_DATE - INTERVAL '3 months'
          )
        )
        ORDER BY ps.bandeja ASC, ps.posicion ASC
      )
      FROM public.planograma_slots ps
      JOIN public.skus s ON s.id = ps.sku_id
      LEFT JOIN public.marcas m ON m.id = s.marca_id
      WHERE ps.planograma_id = pl.id
    )
  )
  INTO v_result
  FROM public.planogramas pl
  JOIN public.tiendas    t ON t.id = pl.tienda_id
  JOIN public.categorias c ON c.id = pl.categoria_id
  WHERE pl.id = p_planograma_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_planograma_mobile(UUID) TO authenticated;

-- ─── 5. RPC: pedido sugerido basado en planograma ────────────────────────────
-- Para cada SKU en el planograma calcula cuánto hay que pedir
CREATE OR REPLACE FUNCTION public.get_planograma_pedido(p_planograma_id UUID)
RETURNS TABLE (
  sku_id          UUID,
  sku_nombre      TEXT,
  marca_nombre    TEXT,
  imagen_url      TEXT,
  precio_lista    NUMERIC,
  frentes_total   BIGINT,   -- suma de frentes en todas las posiciones del planograma
  stock_actual    NUMERIC,  -- último stock conocido en esa tienda
  venta_mensual   NUMERIC,  -- ventas promedio último mes
  semanas_target  INT,      -- target de cobertura (default 10 semanas)
  unidades_target NUMERIC,  -- stock necesario para cubrir target
  unidades_pedir  NUMERIC,  -- max(0, target - stock_actual)
  costo_estimado  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH pl_info AS (
    SELECT pl.tienda_id, pl.categoria_id
    FROM public.planogramas pl
    WHERE pl.id = p_planograma_id
  ),
  slots_agg AS (
    SELECT
      ps.sku_id,
      SUM(COALESCE(ps.frente, 1)) AS frentes_total
    FROM public.planograma_slots ps
    WHERE ps.planograma_id = p_planograma_id
    GROUP BY ps.sku_id
  ),
  kpis_recientes AS (
    SELECT
      k.sku_id,
      AVG(k.ingreso / NULLIF(k.unidades, 0))        AS precio_unitario,
      AVG(k.unidades)                                AS venta_mensual,
      MAX(k.stock_fin)                               AS stock_actual,
      AVG(k.costo_inventario / NULLIF(k.stock_promedio, 0)) AS costo_unitario
    FROM public.mv_sku_kpis_mensual k
    JOIN pl_info ON k.tienda_id = pl_info.tienda_id
    WHERE k.anio_mes >= CURRENT_DATE - INTERVAL '2 months'
    GROUP BY k.sku_id
  )
  SELECT
    sa.sku_id,
    s.nombre                                         AS sku_nombre,
    m.nombre                                         AS marca_nombre,
    s.imagen_url,
    s.precio_lista,
    sa.frentes_total,
    COALESCE(kr.stock_actual,  0)                    AS stock_actual,
    COALESCE(kr.venta_mensual, 0)                    AS venta_mensual,
    10                                               AS semanas_target,
    ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0) AS unidades_target,
    GREATEST(0,
      ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0)
      - COALESCE(kr.stock_actual, 0)
    )                                                AS unidades_pedir,
    GREATEST(0,
      ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0)
      - COALESCE(kr.stock_actual, 0)
    ) * COALESCE(kr.costo_unitario, s.precio_lista * 0.6) AS costo_estimado
  FROM slots_agg sa
  JOIN public.skus   s ON s.id = sa.sku_id
  LEFT JOIN public.marcas m ON m.id = s.marca_id
  LEFT JOIN kpis_recientes kr ON kr.sku_id = sa.sku_id
  WHERE GREATEST(0,
    ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0)
    - COALESCE(kr.stock_actual, 0)
  ) > 0
  ORDER BY unidades_pedir DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_planograma_pedido(UUID) TO authenticated;

-- ─── 6. Actualizar get_planogramas_lista con conteo de asignaciones ──────────
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
  n_tiendas_asignadas   bigint   -- NUEVO: cuántas tiendas usan este planograma como template
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
  ),
  asignaciones_cnt AS (
    SELECT planograma_id, COUNT(*) AS n_tiendas
    FROM public.planograma_asignaciones
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
    COALESCE(sk.slot_count, 0)   AS slot_count,
    sk.avg_gmroi,
    sk.avg_sellthru,
    sk.avg_margen_pct,
    sk.total_ingreso,
    COALESCE(ac.n_tiendas, 0)    AS n_tiendas_asignadas
  FROM public.planogramas p
  JOIN public.tiendas     t ON t.id = p.tienda_id
  JOIN public.categorias  c ON c.id = p.categoria_id
  LEFT JOIN slot_kpis sk ON sk.planograma_id = p.id
  LEFT JOIN asignaciones_cnt ac ON ac.planograma_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_planogramas_lista() TO authenticated;
