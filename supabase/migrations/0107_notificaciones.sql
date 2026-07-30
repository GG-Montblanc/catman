-- 0107_notificaciones.sql
-- No existe un modelo de usuario por tienda (el reponedor accede via link
-- con token, sin sesion) -- no hay a quien enviarle un email/push real "a
-- la tienda". Se implementa como centro de notificaciones IN-APP para el
-- equipo (cualquier usuario autenticado), disparado automaticamente cuando
-- se publica un planograma -- lo mas cercano y honesto a "notificaciones a
-- tienda" dado el modelo de datos actual.

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          TEXT NOT NULL,  -- 'planograma_publicado', etc.
  mensaje       TEXT NOT NULL,
  planograma_id UUID REFERENCES public.planogramas(id) ON DELETE CASCADE,
  tienda_id     UUID REFERENCES public.tiendas(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notificaciones_select" ON public.notificaciones;
CREATE POLICY "notificaciones_select" ON public.notificaciones
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.notificaciones_leidas (
  notificacion_id UUID NOT NULL REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  leida_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notificacion_id, usuario_id)
);

ALTER TABLE public.notificaciones_leidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notificaciones_leidas_select" ON public.notificaciones_leidas;
CREATE POLICY "notificaciones_leidas_select" ON public.notificaciones_leidas
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- publicar_planograma: ahora tambien crea una notificacion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.publicar_planograma(p_planograma_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token   UUID;
  v_nombre  TEXT;
  v_tienda_id UUID;
  v_tienda_nombre TEXT;
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

  SELECT p.nombre, p.tienda_id, t.nombre
  INTO v_nombre, v_tienda_id, v_tienda_nombre
  FROM public.planogramas p
  JOIN public.tiendas t ON t.id = p.tienda_id
  WHERE p.id = p_planograma_id;

  INSERT INTO public.notificaciones (tipo, mensaje, planograma_id, tienda_id)
  VALUES (
    'planograma_publicado',
    format('Planograma "%s" publicado para %s', v_nombre, v_tienda_nombre),
    p_planograma_id,
    v_tienda_id
  );

  RETURN v_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.publicar_planograma TO authenticated;

-- ============================================================================
-- RPCs de lectura/estado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_notificaciones(p_limit INT DEFAULT 20)
RETURNS TABLE(
  id            UUID,
  tipo          TEXT,
  mensaje       TEXT,
  planograma_id UUID,
  tienda_id     UUID,
  creado_en     TIMESTAMPTZ,
  leida         BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    n.id, n.tipo, n.mensaje, n.planograma_id, n.tienda_id, n.creado_en,
    EXISTS (
      SELECT 1 FROM public.notificaciones_leidas nl
      JOIN public.usuarios u ON u.id = nl.usuario_id
      WHERE nl.notificacion_id = n.id AND u.auth_user_id = auth.uid()
    ) AS leida
  FROM public.notificaciones n
  ORDER BY n.creado_en DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_notificaciones TO authenticated;

CREATE OR REPLACE FUNCTION public.contar_notificaciones_no_leidas()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::int
  FROM public.notificaciones n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notificaciones_leidas nl
    JOIN public.usuarios u ON u.id = nl.usuario_id
    WHERE nl.notificacion_id = n.id AND u.auth_user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.contar_notificaciones_no_leidas TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_notificacion_leida(p_notificacion_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();
  IF v_usuario_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notificaciones_leidas (notificacion_id, usuario_id)
  VALUES (p_notificacion_id, v_usuario_id)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.marcar_notificacion_leida TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_todas_notificaciones_leidas()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();
  IF v_usuario_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notificaciones_leidas (notificacion_id, usuario_id)
  SELECT n.id, v_usuario_id FROM public.notificaciones n
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.marcar_todas_notificaciones_leidas TO authenticated;
