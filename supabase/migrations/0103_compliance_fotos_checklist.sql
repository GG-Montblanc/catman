-- 0103_compliance_fotos_checklist.sql
-- Cierra 3 gaps relacionados de "Compliance y ejecucion en tienda":
--   1) Documentacion fotografica -- antes no existia ningun lugar donde
--      guardar una foto del planograma implementado en la tienda real.
--   2) Checklist de cumplimiento persistente -- los checkboxes en
--      MobileView.tsx eran solo estado local de React, se perdian al
--      recargar la pagina.
--   3) Comparacion ideal vs. real -- requiere tener las fotos guardadas
--      (se construye en el frontend, no aca).
--
-- Vive sobre la vista movil autenticada (/planogramas/[id]/mobile, bajo
-- (admin), requiere login) y no sobre /reponedor/[token] (publica, sin
-- sesion) -- asi se puede registrar QUIEN marco cada item, cerrando de
-- paso una porcion del gap de auditoria por usuario para esta accion
-- especifica.

-- ============================================================================
-- 1) Tabla: checklist de cumplimiento por posicion
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.compliance_checklist (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planograma_id  UUID NOT NULL REFERENCES public.planogramas(id) ON DELETE CASCADE,
  bandeja        SMALLINT NOT NULL,
  posicion       SMALLINT NOT NULL,
  cumplido       BOOLEAN NOT NULL DEFAULT false,
  marcado_por    UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  marcado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planograma_id, bandeja, posicion)
);

ALTER TABLE public.compliance_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compliance_checklist_select" ON public.compliance_checklist;
CREATE POLICY "compliance_checklist_select" ON public.compliance_checklist
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 2) Tabla: fotos de compliance (documentacion del planograma real en tienda)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.compliance_fotos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planograma_id  UUID NOT NULL REFERENCES public.planogramas(id) ON DELETE CASCADE,
  bandeja        SMALLINT,  -- NULL = foto general de todo el mueble
  foto_url       TEXT NOT NULL,
  nota           TEXT,
  subido_por     UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  subido_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_fotos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compliance_fotos_select" ON public.compliance_fotos;
CREATE POLICY "compliance_fotos_select" ON public.compliance_fotos
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 3) Storage bucket para las fotos (publico de lectura; solo se escribe
-- via RPC/servidor, nunca insert directo del cliente a storage.objects
-- salvo el propio upload de archivo que requiere su policy de bucket)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-fotos', 'compliance-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "compliance_fotos_storage_read" ON storage.objects;
CREATE POLICY "compliance_fotos_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'compliance-fotos');

DROP POLICY IF EXISTS "compliance_fotos_storage_insert" ON storage.objects;
CREATE POLICY "compliance_fotos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'compliance-fotos');

-- ============================================================================
-- 4) RPCs
-- ============================================================================

-- Marca/desmarca un item del checklist (upsert), registrando quien lo hizo.
CREATE OR REPLACE FUNCTION public.marcar_checklist_item(
  p_planograma_id UUID,
  p_bandeja       SMALLINT,
  p_posicion      SMALLINT,
  p_cumplido      BOOLEAN
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();

  INSERT INTO public.compliance_checklist (planograma_id, bandeja, posicion, cumplido, marcado_por, marcado_en)
  VALUES (p_planograma_id, p_bandeja, p_posicion, p_cumplido, v_usuario_id, now())
  ON CONFLICT (planograma_id, bandeja, posicion) DO UPDATE SET
    cumplido    = EXCLUDED.cumplido,
    marcado_por = EXCLUDED.marcado_por,
    marcado_en  = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.marcar_checklist_item TO authenticated;

-- Estado actual del checklist de un planograma
CREATE OR REPLACE FUNCTION public.get_checklist_planograma(p_planograma_id UUID)
RETURNS TABLE(
  bandeja      SMALLINT,
  posicion     SMALLINT,
  cumplido     BOOLEAN,
  marcado_por_nombre TEXT,
  marcado_en   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cc.bandeja, cc.posicion, cc.cumplido, u.nombre, cc.marcado_en
  FROM public.compliance_checklist cc
  LEFT JOIN public.usuarios u ON u.id = cc.marcado_por
  WHERE cc.planograma_id = p_planograma_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_checklist_planograma TO authenticated;

-- Registra una foto ya subida a Storage (el archivo se sube directo desde
-- el cliente vía Supabase Storage; esta RPC solo guarda la referencia).
CREATE OR REPLACE FUNCTION public.registrar_foto_compliance(
  p_planograma_id UUID,
  p_bandeja       SMALLINT,
  p_foto_url      TEXT,
  p_nota          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_usuario_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = auth.uid();

  INSERT INTO public.compliance_fotos (planograma_id, bandeja, foto_url, nota, subido_por)
  VALUES (p_planograma_id, p_bandeja, p_foto_url, p_nota, v_usuario_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.registrar_foto_compliance TO authenticated;

-- Fotos de compliance de un planograma
CREATE OR REPLACE FUNCTION public.get_fotos_compliance(p_planograma_id UUID)
RETURNS TABLE(
  id           UUID,
  bandeja      SMALLINT,
  foto_url     TEXT,
  nota         TEXT,
  subido_por_nombre TEXT,
  subido_en    TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cf.id, cf.bandeja, cf.foto_url, cf.nota, u.nombre, cf.subido_en
  FROM public.compliance_fotos cf
  LEFT JOIN public.usuarios u ON u.id = cf.subido_por
  WHERE cf.planograma_id = p_planograma_id
  ORDER BY cf.subido_en DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_fotos_compliance TO authenticated;

-- Elimina una foto (borra tambien el archivo de Storage desde el frontend
-- antes de llamar esta RPC, o queda huerfano el objeto -- se documenta
-- en el componente que la usa).
CREATE OR REPLACE FUNCTION public.eliminar_foto_compliance(p_foto_id UUID)
RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.compliance_fotos WHERE id = p_foto_id;
$$;
GRANT EXECUTE ON FUNCTION public.eliminar_foto_compliance TO authenticated;
