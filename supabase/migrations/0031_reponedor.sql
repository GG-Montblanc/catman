-- 0031_reponedor.sql
-- Agrega publicación de planogramas para vista reponedor en tienda (sin login)

-- Campo publicado + token público en planogramas
ALTER TABLE public.planogramas
  ADD COLUMN IF NOT EXISTS publicado        BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS token_publico    UUID      UNIQUE,
  ADD COLUMN IF NOT EXISTS publicado_at     TIMESTAMPTZ;

-- RPC: publicar_planograma
-- Genera token único y marca como publicado. Retorna el token.
CREATE OR REPLACE FUNCTION public.publicar_planograma(p_planograma_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token UUID;
BEGIN
  -- Si ya tiene token, reusar; si no, generar nuevo
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

-- RPC: get_planograma_por_token (sin autenticación — acceso público)
CREATE OR REPLACE FUNCTION public.get_planograma_por_token(p_token UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT row_to_json(r) FROM (
    SELECT
      p.id,
      p.nombre,
      p.n_bandejas,
      p.n_posiciones,
      p.publicado_at,
      t.nombre  AS tienda_nombre,
      t.ciudad  AS tienda_ciudad,
      c.nombre  AS categoria_nombre,
      (
        SELECT json_agg(
          json_build_object(
            'id',         ps.id,
            'bandeja',    ps.bandeja,
            'posicion',   ps.posicion,
            'sku_id',     ps.sku_id,
            'sku_nombre', s.nombre,
            'marca',      mar.nombre,
            'imagen_url', s.imagen_url
          ) ORDER BY ps.bandeja, ps.posicion
        )
        FROM public.planograma_slots ps
        JOIN public.skus s   ON s.id   = ps.sku_id
        LEFT JOIN public.marcas mar ON mar.id = s.marca_id
        WHERE ps.planograma_id = p.id
      ) AS slots
    FROM public.planogramas p
    JOIN public.tiendas    t ON t.id = p.tienda_id
    JOIN public.categorias c ON c.id = p.categoria_id
    WHERE p.token_publico = p_token
      AND p.publicado = true
  ) r;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.publicar_planograma        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_planograma_por_token   TO anon, authenticated;
GRANT UPDATE  ON public.planogramas TO authenticated;
