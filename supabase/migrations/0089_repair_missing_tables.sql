-- 0089_repair_missing_tables.sql
-- 4 tablas definidas en migraciones anteriores (0040, 0080) que nunca se crearon
-- en la base real. Necesarias antes de 0090_repair_missing_rpcs.sql (varias RPCs
-- las referencian). Todo con IF NOT EXISTS — seguro de re-ejecutar.

-- ============================================================================
-- forecast_sku (de 0040_forecast.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.forecast_sku (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id             UUID        NOT NULL REFERENCES public.skus(id)    ON DELETE CASCADE,
  tienda_id          UUID                 REFERENCES public.tiendas(id) ON DELETE CASCADE,
  calculado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anio_mes_inicio    DATE        NOT NULL,
  forecast_json      JSONB       NOT NULL,
  tendencia          TEXT        NOT NULL CHECK (tendencia IN ('creciente','estable','decreciente')),
  alerta             TEXT        NOT NULL CHECK (alerta IN ('ok','quiebre_riesgo','sobrestock')),
  unidades_sugeridas INT         NOT NULL DEFAULT 0,
  UNIQUE (sku_id, tienda_id, anio_mes_inicio)
);

CREATE INDEX IF NOT EXISTS idx_forecast_sku_id
  ON public.forecast_sku (sku_id);
CREATE INDEX IF NOT EXISTS idx_forecast_tienda_id
  ON public.forecast_sku (tienda_id);
CREATE INDEX IF NOT EXISTS idx_forecast_alerta
  ON public.forecast_sku (alerta)
  WHERE alerta <> 'ok';
CREATE INDEX IF NOT EXISTS idx_forecast_calculado
  ON public.forecast_sku (calculado_at DESC);

ALTER TABLE public.forecast_sku ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forecast_sku' AND policyname = 'forecast_sku_select'
  ) THEN
    CREATE POLICY forecast_sku_select
      ON public.forecast_sku FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================================
-- planograma_templates / planograma_template_slots / planograma_asignaciones
-- (de 0080_planograma_templates_y_mobile.sql)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.planograma_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,
  formato     TEXT,
  categoria_id UUID REFERENCES public.categorias(id),
  n_bandejas   SMALLINT NOT NULL DEFAULT 5,
  n_posiciones SMALLINT NOT NULL DEFAULT 10,
  descripcion  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.planograma_template_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.planograma_templates(id) ON DELETE CASCADE,
  bandeja     SMALLINT NOT NULL,
  posicion    SMALLINT NOT NULL,
  sku_id      UUID REFERENCES public.skus(id),
  frente      SMALLINT NOT NULL DEFAULT 1,
  UNIQUE (template_id, bandeja, posicion)
);

CREATE TABLE IF NOT EXISTS public.planograma_asignaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES public.planograma_templates(id) ON DELETE CASCADE,
  tienda_id    UUID NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  planograma_id UUID REFERENCES public.planogramas(id),
  fecha_desde  DATE,
  fecha_hasta  DATE,
  activa       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, tienda_id)
);

CREATE INDEX IF NOT EXISTS idx_planograma_asignaciones_tienda    ON public.planograma_asignaciones(tienda_id);
CREATE INDEX IF NOT EXISTS idx_planograma_asignaciones_template  ON public.planograma_asignaciones(template_id);
CREATE INDEX IF NOT EXISTS idx_planograma_template_slots_tmpl    ON public.planograma_template_slots(template_id);

ALTER TABLE public.planograma_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planograma_template_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planograma_asignaciones    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planograma_templates' AND policyname = 'auth read templates') THEN
    CREATE POLICY "auth read templates" ON public.planograma_templates FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planograma_template_slots' AND policyname = 'auth read template_slots') THEN
    CREATE POLICY "auth read template_slots" ON public.planograma_template_slots FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planograma_asignaciones' AND policyname = 'auth read asignaciones') THEN
    CREATE POLICY "auth read asignaciones" ON public.planograma_asignaciones FOR SELECT TO authenticated USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planograma_templates' AND policyname = 'auth write templates') THEN
    CREATE POLICY "auth write templates" ON public.planograma_templates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planograma_template_slots' AND policyname = 'auth write template_slots') THEN
    CREATE POLICY "auth write template_slots" ON public.planograma_template_slots FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'planograma_asignaciones' AND policyname = 'auth write asignaciones') THEN
    CREATE POLICY "auth write asignaciones" ON public.planograma_asignaciones FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
  END IF;
END $$;
