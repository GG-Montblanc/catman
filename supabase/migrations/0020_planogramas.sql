-- 0020_planogramas.sql — Tablas de planogramas + RPCs para el simulador de estante
-- Phase 2: visualizador heat-map, SKU swap y comparador de escenario

-- ============================================================================
-- PLANOGRAMAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.planogramas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text NOT NULL,
  tienda_id             uuid NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  categoria_id          uuid NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  n_bandejas            smallint NOT NULL DEFAULT 5,
  n_posiciones          smallint NOT NULL DEFAULT 20,
  fecha_vigencia_desde  date NOT NULL DEFAULT CURRENT_DATE,
  fecha_vigencia_hasta  date,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planogramas_tienda    ON public.planogramas(tienda_id);
CREATE INDEX IF NOT EXISTS idx_planogramas_categoria ON public.planogramas(categoria_id);

-- ============================================================================
-- PLANOGRAMA_SLOTS (layout de SKUs en el estante)
-- bandeja: 1 = superior, n = inferior; posicion: 1 = izquierda
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.planograma_slots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planograma_id  uuid NOT NULL REFERENCES public.planogramas(id) ON DELETE CASCADE,
  bandeja        smallint NOT NULL CHECK (bandeja BETWEEN 1 AND 10),
  posicion       smallint NOT NULL CHECK (posicion BETWEEN 1 AND 50),
  sku_id         uuid     NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  frente         smallint NOT NULL DEFAULT 1 CHECK (frente BETWEEN 1 AND 4),
  UNIQUE (planograma_id, bandeja, posicion)
);

CREATE INDEX IF NOT EXISTS idx_slots_planograma ON public.planograma_slots(planograma_id);
CREATE INDEX IF NOT EXISTS idx_slots_sku        ON public.planograma_slots(sku_id);

-- ============================================================================
-- PLANOGRAMA_VERSIONES (historial de cambios)
-- snapshot: JSON completo del planograma en ese momento
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.planograma_versiones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planograma_id  uuid NOT NULL REFERENCES public.planogramas(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  snapshot       jsonb NOT NULL,
  comentario     text,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (planograma_id, version)
);

CREATE INDEX IF NOT EXISTS idx_versiones_planograma ON public.planograma_versiones(planograma_id, version DESC);

-- ============================================================================
-- SKU_CORRELACION (basket analysis aproximado: SKUs co-vendidos)
-- Calculado por el script de generación de datos sintéticos
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sku_correlacion (
  sku_a          uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  sku_b          uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  score          numeric(6,4) NOT NULL,
  calculado_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sku_a, sku_b)
);

-- ============================================================================
-- RPC: get_planograma_con_kpis
-- Devuelve el planograma completo con datos de SKU + KPIs por slot
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_planograma_con_kpis(
  p_planograma_id  uuid,
  p_desde          date DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta          date DEFAULT CURRENT_DATE::date
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'id',            p.id,
    'nombre',        p.nombre,
    'n_bandejas',    p.n_bandejas,
    'n_posiciones',  p.n_posiciones,
    'fecha_desde',   p.fecha_vigencia_desde,
    'fecha_hasta',   p.fecha_vigencia_hasta,
    'tienda',        json_build_object('id', t.id, 'nombre', t.nombre, 'ciudad', t.ciudad),
    'categoria',     json_build_object('id', cat.id, 'nombre', cat.nombre, 'ruta', cat.ruta),
    'kpis_resumen',  (
      SELECT json_build_object(
        'avg_gmroi',      ROUND(AVG(m.gmroi)       FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2),
        'avg_sellthru',   ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2),
        'avg_margen_pct', ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2),
        'total_ingreso',  SUM(m.ingreso),
        'total_margen',   SUM(m.margen)
      )
      FROM public.planograma_slots ps2
      JOIN public.mv_sku_kpis_mensual m ON m.sku_id = ps2.sku_id
        AND m.tienda_id = p.tienda_id
        AND m.anio_mes BETWEEN p_desde AND p_hasta
      WHERE ps2.planograma_id = p.id
    ),
    'slots',         (
      SELECT json_agg(
        json_build_object(
          'id',        ps.id,
          'bandeja',   ps.bandeja,
          'posicion',  ps.posicion,
          'frente',    ps.frente,
          'sku', json_build_object(
            'id',           s.id,
            'nombre',       s.nombre,
            'sku_externo',  s.sku_externo,
            'imagen_url',   s.imagen_url,
            'precio_lista', s.precio_lista,
            'marca_nombre', mar.nombre,
            'categoria_id', s.categoria_id
          ),
          'kpis', COALESCE((
            SELECT json_build_object(
              'avg_gmroi',      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2),
              'avg_sellthru',   ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2),
              'avg_margen_pct', ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2),
              'avg_mdi',        ROUND(AVG(m.mdi_meses), 2),
              'avg_fill_rate',  ROUND(AVG(m.fill_rate) * 100, 1),
              'total_ingreso',  SUM(m.ingreso),
              'total_margen',   SUM(m.margen)
            )
            FROM public.mv_sku_kpis_mensual m
            WHERE m.sku_id    = ps.sku_id
              AND m.tienda_id = p.tienda_id
              AND m.anio_mes BETWEEN p_desde AND p_hasta
          ), json_build_object(
            'avg_gmroi', NULL, 'avg_sellthru', NULL,
            'avg_margen_pct', NULL, 'avg_mdi', NULL,
            'avg_fill_rate', NULL, 'total_ingreso', 0, 'total_margen', 0
          ))
        )
        ORDER BY ps.bandeja, ps.posicion
      )
      FROM public.planograma_slots ps
      JOIN public.skus  s   ON s.id   = ps.sku_id
      LEFT JOIN public.marcas mar ON mar.id = s.marca_id
      WHERE ps.planograma_id = p.id
    )
  )
  FROM public.planogramas p
  JOIN public.tiendas     t   ON t.id   = p.tienda_id
  JOIN public.categorias  cat ON cat.id = p.categoria_id
  WHERE p.id = p_planograma_id;
$$;

-- ============================================================================
-- RPC: get_swap_candidatos
-- SKUs candidatos para reemplazar un slot, con sus KPIs y delta vs original
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_swap_candidatos(
  p_sku_id        uuid,
  p_planograma_id uuid,
  p_modo          text  DEFAULT 'categoria',  -- 'categoria' | 'marca'
  p_desde         date  DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta         date  DEFAULT CURRENT_DATE::date,
  p_limit         int   DEFAULT 20
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH tienda AS (
    SELECT tienda_id FROM public.planogramas WHERE id = p_planograma_id
  ),
  current_sku AS (
    SELECT s.categoria_id, s.marca_id FROM public.skus s WHERE s.id = p_sku_id
  ),
  current_kpis AS (
    SELECT
      ROUND(AVG(gmroi)        FILTER (WHERE gmroi > 0 AND gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(sellthru_pct) FILTER (WHERE sellthru_pct IS NOT NULL), 2)  AS avg_sellthru,
      ROUND(AVG(margen_pct)   FILTER (WHERE margen_pct IS NOT NULL), 2)    AS avg_margen_pct,
      ROUND(AVG(mdi_meses), 2) AS avg_mdi,
      SUM(ingreso)              AS total_ingreso,
      SUM(margen)               AS total_margen
    FROM public.mv_sku_kpis_mensual
    WHERE sku_id    = p_sku_id
      AND tienda_id = (SELECT tienda_id FROM tienda)
      AND anio_mes BETWEEN p_desde AND p_hasta
  ),
  candidatos AS (
    SELECT
      s.id, s.nombre, s.imagen_url, s.precio_lista, s.sku_externo,
      mar.nombre AS marca_nombre,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2)    AS avg_sellthru,
      ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2)      AS avg_margen_pct,
      ROUND(AVG(m.mdi_meses), 2) AS avg_mdi,
      SUM(m.ingreso)              AS total_ingreso,
      SUM(m.margen)               AS total_margen
    FROM public.skus s
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    LEFT JOIN public.mv_sku_kpis_mensual m
           ON m.sku_id    = s.id
          AND m.tienda_id = (SELECT tienda_id FROM tienda)
          AND m.anio_mes BETWEEN p_desde AND p_hasta
    WHERE s.activo = true
      AND s.id != p_sku_id
      AND (
        CASE p_modo
          WHEN 'marca'     THEN s.marca_id = (SELECT marca_id FROM current_sku)
          ELSE                  s.categoria_id = (SELECT categoria_id FROM current_sku)
        END
      )
      -- No incluir SKUs ya asignados en otro slot del planograma
      AND s.id NOT IN (
        SELECT sku_id FROM public.planograma_slots
        WHERE planograma_id = p_planograma_id AND sku_id != p_sku_id
      )
    GROUP BY s.id, s.nombre, s.imagen_url, s.precio_lista, s.sku_externo, mar.nombre
    ORDER BY AVG(m.gmroi) FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100) DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT json_build_object(
    'current_kpis', (SELECT row_to_json(ck) FROM current_kpis ck),
    'candidatos', (
      SELECT json_agg(
        json_build_object(
          'id',             c.id,
          'nombre',         c.nombre,
          'imagen_url',     c.imagen_url,
          'precio_lista',   c.precio_lista,
          'sku_externo',    c.sku_externo,
          'marca_nombre',   c.marca_nombre,
          'avg_gmroi',      c.avg_gmroi,
          'avg_sellthru',   c.avg_sellthru,
          'avg_margen_pct', c.avg_margen_pct,
          'avg_mdi',        c.avg_mdi,
          'total_ingreso',  c.total_ingreso,
          'total_margen',   c.total_margen,
          -- deltas vs current SKU
          'delta_gmroi',      ROUND(c.avg_gmroi      - (SELECT avg_gmroi      FROM current_kpis), 2),
          'delta_sellthru',   ROUND(c.avg_sellthru   - (SELECT avg_sellthru   FROM current_kpis), 2),
          'delta_margen_pct', ROUND(c.avg_margen_pct - (SELECT avg_margen_pct FROM current_kpis), 2),
          'delta_ingreso',    ROUND(c.total_ingreso  - (SELECT total_ingreso  FROM current_kpis), 0)
        )
      )
      FROM candidatos c
    )
  );
$$;

-- ============================================================================
-- RPC: guardar_version_planograma
-- Persiste un snapshot del planograma + aplica los cambios de slots
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guardar_version_planograma(
  p_planograma_id  uuid,
  p_swaps          json,   -- [{ slot_id, nuevo_sku_id }]
  p_comentario     text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_version int;
  v_swap    json;
BEGIN
  -- Calcular próxima versión
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.planograma_versiones
  WHERE planograma_id = p_planograma_id;

  -- Guardar snapshot del estado actual ANTES de los cambios
  INSERT INTO public.planograma_versiones (planograma_id, version, snapshot, comentario)
  SELECT
    p_planograma_id,
    v_version,
    (SELECT json_agg(json_build_object(
        'slot_id', ps.id, 'bandeja', ps.bandeja, 'posicion', ps.posicion,
        'sku_id', ps.sku_id, 'frente', ps.frente
      ))
     FROM public.planograma_slots ps WHERE ps.planograma_id = p_planograma_id),
    p_comentario;

  -- Aplicar swaps
  FOR v_swap IN SELECT * FROM json_array_elements(p_swaps)
  LOOP
    UPDATE public.planograma_slots
    SET sku_id = (v_swap->>'nuevo_sku_id')::uuid
    WHERE id   = (v_swap->>'slot_id')::uuid
      AND planograma_id = p_planograma_id;
  END LOOP;

  RETURN json_build_object('version', v_version, 'ok', true);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_planograma_con_kpis    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_swap_candidatos        TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_version_planograma TO authenticated;
GRANT SELECT  ON public.planogramas           TO authenticated;
GRANT SELECT  ON public.planograma_slots      TO authenticated;
GRANT SELECT  ON public.planograma_versiones  TO authenticated;
GRANT SELECT  ON public.sku_correlacion       TO authenticated;
GRANT INSERT, UPDATE ON public.planogramas          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.planograma_slots    TO authenticated;
GRANT INSERT  ON public.planograma_versiones TO authenticated;
