-- 0104_auditoria_versiones.sql
-- El historial de versiones de planogramas (planograma_versiones) registraba
-- que cambio y cuando, pero no QUIEN lo hizo -- gap de auditoria explicito.
-- Se agrega creado_por (resuelto desde auth.uid() al guardar), igual que ya
-- se hizo para el checklist/fotos de compliance en 0103.

ALTER TABLE public.planograma_versiones
  ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

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
  v_version      int;
  v_swap         json;
  v_snapshot     json;
  v_swaps_detail json;
  v_usuario_id   uuid;
BEGIN
  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();

  -- Next version number
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.planograma_versiones
  WHERE planograma_id = p_planograma_id;

  -- Build slot snapshot (state BEFORE changes) with SKU names
  SELECT json_agg(
    json_build_object(
      'slot_id',   ps.id,
      'bandeja',   ps.bandeja,
      'posicion',  ps.posicion,
      'frente',    ps.frente,
      'sku_id',    ps.sku_id,
      'sku_nombre', s.nombre
    )
  )
  INTO v_snapshot
  FROM public.planograma_slots ps
  JOIN public.skus s ON s.id = ps.sku_id
  WHERE ps.planograma_id = p_planograma_id;

  -- Build enriched swap details
  SELECT json_agg(
    json_build_object(
      'bandeja',  ps.bandeja,
      'posicion', ps.posicion,
      'orig_sku', json_build_object('id', ps.sku_id, 'nombre', orig.nombre),
      'new_sku',  json_build_object('id', (sw->>'nuevo_sku_id')::uuid, 'nombre', new_s.nombre)
    )
  )
  INTO v_swaps_detail
  FROM json_array_elements(p_swaps) sw
  JOIN public.planograma_slots ps ON ps.id = (sw->>'slot_id')::uuid
  JOIN public.skus orig ON orig.id = ps.sku_id
  JOIN public.skus new_s ON new_s.id = (sw->>'nuevo_sku_id')::uuid;

  -- Persist version with both slot snapshot + swap details + autor
  INSERT INTO public.planograma_versiones (planograma_id, version, snapshot, comentario, creado_por)
  VALUES (
    p_planograma_id,
    v_version,
    json_build_object(
      'slots',      v_snapshot,
      'swaps',      v_swaps_detail,
      'slot_count', (SELECT COUNT(*) FROM public.planograma_slots WHERE planograma_id = p_planograma_id),
      'v',          2
    ),
    p_comentario,
    v_usuario_id
  );

  -- Apply swaps
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
