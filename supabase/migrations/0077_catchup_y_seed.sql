-- ============================================================================
-- 0077_catchup_y_seed.sql
-- Catch-up: asegura que todas las funciones críticas existan
-- y siembra planogramas de demo directamente (sin llamar RPCs).
-- Ejecutar en Supabase SQL Editor (todo de una vez).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REFRESH MV (por si no existe la función helper)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_mv_kpis_manual()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sku_kpis_mensual;
  RETURN 'ok: ' || now()::text;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.mv_sku_kpis_mensual;
  RETURN 'ok (no concurrent): ' || now()::text;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_mv_kpis_manual() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. guardar_version_planograma v2 (snapshot enriquecido con swaps)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guardar_version_planograma(
  p_planograma_id  uuid,
  p_swaps          json,
  p_comentario     text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_version   int;
  v_swap      json;
  v_swap_arr  json;
  v_slot_arr  json;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.planograma_versiones
  WHERE planograma_id = p_planograma_id;

  -- Slot snapshot with SKU names
  SELECT json_agg(json_build_object(
    'slot_id',    ps.id,
    'bandeja',    ps.bandeja,
    'posicion',   ps.posicion,
    'sku_id',     ps.sku_id,
    'sku_nombre', s.nombre,
    'frente',     ps.frente
  ))
  INTO v_slot_arr
  FROM public.planograma_slots ps
  JOIN public.skus s ON s.id = ps.sku_id
  WHERE ps.planograma_id = p_planograma_id;

  -- Build enriched swap array with SKU names
  SELECT json_agg(
    json_build_object(
      'bandeja',  (SELECT bandeja  FROM public.planograma_slots WHERE id = (sw->>'slot_id')::uuid),
      'posicion', (SELECT posicion FROM public.planograma_slots WHERE id = (sw->>'slot_id')::uuid),
      'orig_sku', json_build_object(
        'id',     (SELECT sku_id FROM public.planograma_slots WHERE id = (sw->>'slot_id')::uuid),
        'nombre', (SELECT s.nombre FROM public.skus s
                   JOIN public.planograma_slots ps ON ps.sku_id = s.id
                   WHERE ps.id = (sw->>'slot_id')::uuid)
      ),
      'new_sku',  json_build_object(
        'id',     (sw->>'nuevo_sku_id')::uuid,
        'nombre', (SELECT nombre FROM public.skus WHERE id = (sw->>'nuevo_sku_id')::uuid)
      )
    )
  )
  INTO v_swap_arr
  FROM json_array_elements(p_swaps) sw;

  INSERT INTO public.planograma_versiones (planograma_id, version, snapshot, comentario)
  VALUES (
    p_planograma_id,
    v_version,
    json_build_object(
      'v',          2,
      'slot_count', (SELECT COUNT(*) FROM public.planograma_slots WHERE planograma_id = p_planograma_id),
      'slots',      COALESCE(v_slot_arr, '[]'::json),
      'swaps',      COALESCE(v_swap_arr, '[]'::json)
    )::jsonb,
    p_comentario
  );

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
GRANT EXECUTE ON FUNCTION public.guardar_version_planograma TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_planogramas_lista
-- ─────────────────────────────────────────────────────────────────────────────
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
  total_ingreso         numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH slot_kpis AS (
    SELECT
      ps.planograma_id,
      COUNT(DISTINCT ps.id)                 AS slot_count,
      AVG(k.gmroi)                          AS avg_gmroi,
      AVG(k.sellthru_pct)                   AS avg_sellthru,
      AVG(k.margen_pct)                     AS avg_margen_pct,
      SUM(k.ingreso)                        AS total_ingreso
    FROM public.planograma_slots ps
    JOIN public.planogramas pl ON pl.id = ps.planograma_id
    JOIN public.mv_sku_kpis_mensual k
      ON  k.sku_id    = ps.sku_id
      AND k.tienda_id = pl.tienda_id
      AND k.anio_mes >= (CURRENT_DATE - INTERVAL '6 months')
    GROUP BY ps.planograma_id
  )
  SELECT
    p.id, p.nombre, p.n_bandejas, p.n_posiciones,
    p.fecha_vigencia_desde, p.fecha_vigencia_hasta,
    p.tienda_id,
    t.nombre      AS tienda_nombre,
    t.ciudad      AS tienda_ciudad,
    c.nombre      AS categoria_nombre,
    p.created_at,
    COALESCE(sk.slot_count, 0) AS slot_count,
    sk.avg_gmroi, sk.avg_sellthru, sk.avg_margen_pct, sk.total_ingreso
  FROM public.planogramas p
  JOIN public.tiendas    t ON t.id = p.tienda_id
  JOIN public.categorias c ON c.id = p.categoria_id
  LEFT JOIN slot_kpis sk ON sk.planograma_id = p.id
  ORDER BY p.created_at DESC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION public.get_planogramas_lista() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SEED PLANOGRAMAS DIRECTAMENTE (sin RPCs)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  _tienda_id   uuid;
  _cat_id      uuid;
  _plan_id     uuid;
  _sku_ids     uuid[];
  _n_skus      int;
  _bandeja     int;
  _posicion    int;
  _slot_idx    int;
  _n_bandejas  int := 5;
  _n_pos       int := 20;

  -- Cursor for tiendas × categorias combos
  _tiendas     uuid[];
  _cats        uuid[];
  _i           int;
  _j           int;
BEGIN
  -- Only seed if no planograms exist
  IF (SELECT COUNT(*) FROM public.planogramas) > 0 THEN
    RAISE NOTICE 'Planogramas ya existen (%), omitiendo seed.', (SELECT COUNT(*) FROM public.planogramas);
    RETURN;
  END IF;

  -- Get 4 active tiendas
  SELECT array_agg(id ORDER BY nombre) INTO _tiendas
  FROM (SELECT id, nombre FROM public.tiendas WHERE activa = true LIMIT 4) t;

  IF _tiendas IS NULL OR array_length(_tiendas, 1) = 0 THEN
    RAISE NOTICE 'No hay tiendas, abortando seed.';
    RETURN;
  END IF;

  -- Get 3 root categories
  SELECT array_agg(id ORDER BY nombre) INTO _cats
  FROM (SELECT id, nombre FROM public.categorias WHERE parent_id IS NULL LIMIT 3) c;

  IF _cats IS NULL OR array_length(_cats, 1) = 0 THEN
    RAISE NOTICE 'No hay categorias raíz, abortando seed.';
    RETURN;
  END IF;

  -- For each tienda × categoria
  FOR _i IN 1..array_length(_tiendas, 1) LOOP
    _tienda_id := _tiendas[_i];
    FOR _j IN 1..array_length(_cats, 1) LOOP
      _cat_id := _cats[_j];

      -- Get up to 100 active SKUs from this category tree
      SELECT array_agg(s.id ORDER BY random())
      INTO _sku_ids
      FROM public.skus s
      WHERE s.activo = true
        AND s.categoria_id IN (
          SELECT id FROM public.categorias
          WHERE id = _cat_id
             OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = _cat_id)
        )
      LIMIT (_n_bandejas * _n_pos);

      IF _sku_ids IS NULL OR array_length(_sku_ids, 1) = 0 THEN
        CONTINUE; -- no SKUs for this category
      END IF;

      -- Create planograma
      INSERT INTO public.planogramas (
        nombre, tienda_id, categoria_id,
        n_bandejas, n_posiciones, fecha_vigencia_desde
      )
      VALUES (
        (SELECT nombre FROM public.categorias WHERE id = _cat_id)
          || ' — '
          || (SELECT nombre FROM public.tiendas WHERE id = _tienda_id)
          || ' — ' || to_char(CURRENT_DATE, 'MM/YYYY'),
        _tienda_id,
        _cat_id,
        _n_bandejas::smallint,
        _n_pos::smallint,
        CURRENT_DATE
      )
      RETURNING id INTO _plan_id;

      _n_skus   := array_length(_sku_ids, 1);
      _slot_idx := 1;

      -- Fill slots: bandeja 1..5, posicion 1..20
      FOR _bandeja IN 1.._n_bandejas LOOP
        FOR _posicion IN 1.._n_pos LOOP
          EXIT WHEN _slot_idx > _n_skus;
          INSERT INTO public.planograma_slots (
            planograma_id, bandeja, posicion, sku_id, frente
          )
          VALUES (
            _plan_id, _bandeja::smallint, _posicion::smallint,
            _sku_ids[_slot_idx], 1
          )
          ON CONFLICT (planograma_id, bandeja, posicion) DO NOTHING;
          _slot_idx := _slot_idx + 1;
        END LOOP;
      END LOOP;

      RAISE NOTICE 'Planograma creado: % | Tienda: % | Cat: % | Slots: %',
        _plan_id,
        (SELECT nombre FROM public.tiendas    WHERE id = _tienda_id),
        (SELECT nombre FROM public.categorias WHERE id = _cat_id),
        _slot_idx - 1;
    END LOOP;
  END LOOP;
END $$;
