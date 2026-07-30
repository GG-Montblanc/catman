-- 0106_enforcement_roles.sql
-- Hasta ahora, el rol admin/analyst solo ocultaba botones en la UI -- las
-- RPCs de mutacion son SECURITY DEFINER (bypasean RLS) y planograma_tiendas
-- tenia una policy "FOR ALL TO authenticated USING (TRUE)", asi que
-- cualquier usuario autenticado podia escribir directo (via API/devtools)
-- sin pasar por la UI que lo bloqueaba. Se agrega enforcement real:
--
--   - es_admin(): helper que chequea el rol del usuario autenticado actual.
--   - guardar_version_planograma / publicar_planograma: ahora exigen admin
--     (las mismas 2 acciones que ya estaban deshabilitadas en la UI para
--     analyst en el simulador/editor).
--   - planograma_tiendas: policy de escritura reemplazada para exigir admin,
--     en vez de "cualquier autenticado".
--
-- Las RPCs de compliance/pedidos (marcar_checklist_item, registrar_foto_
-- compliance, crear_pedido, actualizar_estado_pedido) NO se restringen a
-- admin -- son acciones que un reponedor de tienda (no necesariamente admin)
-- debe poder hacer.

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_user_id = auth.uid() AND rol = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.es_admin TO authenticated;

-- ============================================================================
-- guardar_version_planograma: exige admin
-- ============================================================================
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
  v_version      int;
  v_swap         json;
  v_snapshot     json;
  v_swaps_detail json;
  v_usuario_id   uuid;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un usuario admin puede editar planogramas' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.planograma_versiones
  WHERE planograma_id = p_planograma_id;

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

-- ============================================================================
-- publicar_planograma: exige admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publicar_planograma(p_planograma_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token UUID;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un usuario admin puede publicar planogramas' USING ERRCODE = '42501';
  END IF;

  SELECT token_publico INTO v_token
  FROM public.planogramas WHERE id = p_planograma_id;

  IF v_token IS NULL THEN
    v_token := gen_random_uuid();
  END IF;

  UPDATE public.planogramas
  SET
    publicado     = true,
    token_publico = v_token,
    publicado_at  = NOW()
  WHERE id = p_planograma_id;

  RETURN v_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.publicar_planograma TO authenticated;

-- ============================================================================
-- planograma_tiendas: la policy de escritura pasa de "cualquier
-- authenticated" a "solo admin"
-- ============================================================================
DROP POLICY IF EXISTS "auth write planograma_tiendas" ON public.planograma_tiendas;
CREATE POLICY "admin write planograma_tiendas"
  ON public.planograma_tiendas FOR ALL TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());
