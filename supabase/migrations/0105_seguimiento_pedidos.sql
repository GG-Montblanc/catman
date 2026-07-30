-- 0105_seguimiento_pedidos.sql
-- El pedido sugerido (get_planograma_pedido) solo se podia exportar a CSV --
-- no quedaba ningun registro de que un pedido se genero, ni de su estado
-- (pendiente -> enviado -> recibido). Se agrega una tabla de seguimiento
-- simple: cada vez que alguien genera un pedido desde la UI, se guarda un
-- snapshot con su estado, y se puede avanzar el estado desde ahi.

CREATE TABLE IF NOT EXISTS public.pedidos_generados (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planograma_id  UUID NOT NULL REFERENCES public.planogramas(id) ON DELETE CASCADE,
  items          JSONB NOT NULL,   -- snapshot: [{sku_id, sku_nombre, unidades_pedir, costo_estimado}]
  total_unidades INTEGER NOT NULL DEFAULT 0,
  total_costo    NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'recibido')),
  generado_por   UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  generado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en     TIMESTAMPTZ,
  recibido_en    TIMESTAMPTZ
);

ALTER TABLE public.pedidos_generados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pedidos_generados_select" ON public.pedidos_generados;
CREATE POLICY "pedidos_generados_select" ON public.pedidos_generados
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.crear_pedido(
  p_planograma_id  UUID,
  p_items          JSONB,
  p_total_unidades INTEGER,
  p_total_costo    NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_usuario_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();

  INSERT INTO public.pedidos_generados (planograma_id, items, total_unidades, total_costo, generado_por)
  VALUES (p_planograma_id, p_items, p_total_unidades, p_total_costo, v_usuario_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.crear_pedido TO authenticated;

CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido(
  p_pedido_id UUID,
  p_estado    TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_estado NOT IN ('pendiente', 'enviado', 'recibido') THEN
    RAISE EXCEPTION 'Estado invalido: %', p_estado;
  END IF;

  UPDATE public.pedidos_generados
  SET
    estado      = p_estado,
    enviado_en  = CASE WHEN p_estado = 'enviado'  THEN now() ELSE enviado_en  END,
    recibido_en = CASE WHEN p_estado = 'recibido' THEN now() ELSE recibido_en END
  WHERE id = p_pedido_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_pedido TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pedidos_planograma(p_planograma_id UUID)
RETURNS TABLE(
  id              UUID,
  items           JSONB,
  total_unidades  INTEGER,
  total_costo     NUMERIC,
  estado          TEXT,
  generado_por_nombre TEXT,
  generado_en     TIMESTAMPTZ,
  enviado_en      TIMESTAMPTZ,
  recibido_en     TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT pg.id, pg.items, pg.total_unidades, pg.total_costo, pg.estado,
         u.nombre, pg.generado_en, pg.enviado_en, pg.recibido_en
  FROM public.pedidos_generados pg
  LEFT JOIN public.usuarios u ON u.id = pg.generado_por
  WHERE pg.planograma_id = p_planograma_id
  ORDER BY pg.generado_en DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_pedidos_planograma TO authenticated;
