-- 0102_dimensiones_fisicas.sql
-- Fase 2 (fundacion): dimensiones fisicas de producto y de fixture, base para
-- vista a escala real y alertas de espacio en el editor de planogramas.
--
-- Diseno (decidido con el usuario): cada CATEGORIA (nivel 2 / subfamilia,
-- que es donde realmente cuelgan los SKUs) tiene un rango TIPICO de
-- alto/ancho/profundidad en cm -- coherente con lo que ese tipo de producto
-- realmente mide (un labial no comparte tamano con una crema corporal).
-- Cada SKU puede tener sus propias dimensiones (override) cuando es atipico
-- para su categoria; si no las tiene, se usa el default de su categoria.
--
-- No se migran datos reales de dimensiones (no existen) -- se seedean
-- valores tipicos de industria por subfamilia de cosmetica, curados a mano.

-- ============================================================================
-- 1) Categorias: rango tipico de dimensiones (jsonb, un objeto por eje)
-- ============================================================================
ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS dimensiones_tipicas JSONB;

COMMENT ON COLUMN public.categorias.dimensiones_tipicas IS
  'Rango tipico de tamano para productos de esta categoria, en cm. '
  'Formato: {"alto": {"default": N, "min": N, "max": N}, "ancho": {...}, "profundidad": {...}}. '
  'Solo poblado en categorias nivel 2 (donde cuelgan los SKUs).';

-- ============================================================================
-- 2) SKUs: dimensiones propias (override). NULL = usar default de categoria.
-- ============================================================================
ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS alto_cm         NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS ancho_cm        NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS profundidad_cm  NUMERIC(6,2);

COMMENT ON COLUMN public.skus.alto_cm IS
  'Alto real del producto en cm. NULL = usar el default de su categoria (dimensiones_tipicas).';

-- ============================================================================
-- 3) Planogramas: ancho fisico disponible por bandeja (fixture real)
-- ============================================================================
ALTER TABLE public.planogramas
  ADD COLUMN IF NOT EXISTS ancho_cm        NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS alto_bandeja_cm NUMERIC(6,2);

COMMENT ON COLUMN public.planogramas.ancho_cm IS
  'Ancho fisico disponible por bandeja, en cm. NULL en planogramas legacy '
  '-- se asume n_posiciones * 6cm como fallback razonable hasta que se edite.';

-- ============================================================================
-- 4) Seed de dimensiones tipicas por subfamilia (curado a mano, industria cosmetica)
-- ============================================================================
WITH datos(ruta, alto_def, alto_min, alto_max, ancho_def, ancho_min, ancho_max, prof_def, prof_min, prof_max) AS (
  VALUES
    -- maquillaje
    ('maquillaje/labios',          8,  2, 14,   2, 1.5, 3.5,  2, 1.5, 3.5),
    ('maquillaje/ojos',           10,  5, 15,   2,   1,   4,  2,   1,   4),
    ('maquillaje/rostro',          6,  3, 10,   5,   3,   8,  3,   2,   6),
    ('maquillaje/cejas',           9,  6, 13, 1.5,   1,   3,1.5,   1,   3),
    ('maquillaje/accesorios',     12,  5, 25,   5,   2,  10,  3,   1,   8),
    ('maquillaje/unas',            4,  3,  6, 1.5,   1, 2.5,1.5,   1, 2.5),
    ('maquillaje/sets-maquillaje',15,  8, 25,  12,   6,  20,  4,   2,   8),
    -- skincare
    ('skincare/desmaquillantes',  15, 10, 20,   6,   4,   9,  6,   4,   9),
    ('skincare/limpiadores',      15, 10, 20,   6,   4,   9,  6,   4,   9),
    ('skincare/tonicos',          15, 10, 20,   6,   4,   9,  6,   4,   9),
    ('skincare/serum',            10,  6, 14,   4,   3,   6,  4,   3,   6),
    ('skincare/cremas',            7,  4, 12,   6,   4,  10,  6,   4,  10),
    ('skincare/contorno-de-ojos',  6,  3,  9,   3,   2,   5,  3,   2,   5),
    ('skincare/exfoliantes',      12,  8, 18,   6,   4,   9,  6,   4,   9),
    ('skincare/mascarillas',       8,  4, 14,   6,   3,  10,  4,   2,   8),
    ('skincare/sets-skincare',    18, 10, 25,  14,   8,  20,  6,   3,  10),
    ('skincare/labios',            6,  3, 10,   2,   1,   3,  2,   1,   3),
    ('skincare/aceites',          12,  8, 16,   4,   3,   6,  4,   3,   6),
    ('skincare/brumas',           15, 10, 20,   5,   4,   7,  5,   4,   7),
    ('skincare/anti-acne',        12,  6, 18,   5,   3,   8,  5,   3,   8),
    ('skincare/ampollas',          8,  5, 12,   3,   2,   5,  3,   2,   5),
    ('skincare/protectores-solares',15,10, 22,  5,   4,   8,  5,   4,   8),
    ('skincare/autobronceantes',  15, 10, 20,   5,   4,   8,  5,   4,   8),
    ('skincare/accesorios',       10,  3, 20,   5,   2,  10,  3,   1,   8),
    ('skincare/hombre',           14,  8, 20,   6,   4,   9,  6,   4,   9),
    -- corporal
    ('corporal/sets',             18, 10, 25,  14,   8,  20,  6,   3,  10),
    ('corporal/autobronceantes',  18, 12, 25,   7,   5,   9,  7,   5,   9),
    ('corporal/aceites-corporales',18,12, 25,   6,   5,   8,  6,   5,   8),
    ('corporal/exfoliantes',      15, 10, 20,   8,   6,  12,  8,   6,  12),
    ('corporal/hidratantes',      18, 12, 25,   7,   5,  10,  7,   5,  10),
    ('corporal/protectores-solares',18,12, 25,  6,   5,   8,  6,   5,   8),
    ('corporal/depilacion',       12,  6, 20,   5,   3,   8,  5,   3,   8),
    ('corporal/jabones',           8,  5, 11,   6,   4,   9,  4,   2,   6),
    ('corporal/dermocorporal',    18, 12, 25,   7,   5,  10,  7,   5,  10),
    ('corporal/accesorios',       10,  3, 20,   6,   2,  12,  4,   1,  10),
    -- capilar
    ('capilar/sets',              20, 12, 28,  16,   8,  22,  7,   4,  10),
    ('capilar/shampoo',           22, 15, 30,   7,   5,  10,  7,   5,  10),
    ('capilar/acondicionador',    22, 15, 30,   7,   5,  10,  7,   5,  10),
    ('capilar/mascarillas',       15, 10, 22,   8,   6,  12,  8,   6,  12),
    ('capilar/fijadores',         20, 15, 28,   6,   4,   8,  6,   4,   8),
    ('capilar/protectores-termicos',18,12,25,   6,   4,   8,  6,   4,   8),
    ('capilar/tratamientos',      15,  8, 22,   6,   4,  10,  6,   4,  10),
    ('capilar/accesorios',        12,  5, 25,   6,   2,  12,  4,   1,  10),
    ('capilar/coloracion',        16, 10, 22,   8,   5,  12,  5,   3,   8),
    -- perfumes
    ('perfumes/sets-de-perfumes', 16, 10, 22,  14,   8,  20,  7,   4,  10),
    ('perfumes/hombre',           14,  8, 20,   6,   4,   9,  4,   2,   7),
    ('perfumes/mujer',            14,  8, 20,   6,   4,   9,  4,   2,   7)
)
UPDATE public.categorias c
SET dimensiones_tipicas = jsonb_build_object(
  'alto',        jsonb_build_object('default', d.alto_def, 'min', d.alto_min, 'max', d.alto_max),
  'ancho',       jsonb_build_object('default', d.ancho_def, 'min', d.ancho_min, 'max', d.ancho_max),
  'profundidad', jsonb_build_object('default', d.prof_def, 'min', d.prof_min, 'max', d.prof_max)
)
FROM datos d
WHERE c.ruta = d.ruta;

-- Fallback generico para cualquier categoria nivel 2 que no calzo con el seed
-- (por si el catalogo real tiene rutas distintas a las curadas arriba)
UPDATE public.categorias
SET dimensiones_tipicas = jsonb_build_object(
  'alto',        jsonb_build_object('default', 10, 'min', 5, 'max', 20),
  'ancho',       jsonb_build_object('default', 5,  'min', 2, 'max', 10),
  'profundidad', jsonb_build_object('default', 5,  'min', 2, 'max', 10)
)
WHERE nivel = 2 AND dimensiones_tipicas IS NULL;

-- ============================================================================
-- 5) RPC: get_dimensiones_skus
-- Resuelve dimensiones efectivas (override del SKU, si no default de su
-- categoria, si no fallback global) para una lista de SKUs de una sola vez
-- -- pensado para el editor de planogramas (pool + slots en un solo llamado).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dimensiones_skus(p_sku_ids UUID[])
RETURNS TABLE(
  sku_id          UUID,
  alto_cm         NUMERIC,
  ancho_cm        NUMERIC,
  profundidad_cm  NUMERIC,
  fuente          TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.id,
    COALESCE(s.alto_cm,        (c.dimensiones_tipicas->'alto'->>'default')::numeric,        10) AS alto_cm,
    COALESCE(s.ancho_cm,       (c.dimensiones_tipicas->'ancho'->>'default')::numeric,        5) AS ancho_cm,
    COALESCE(s.profundidad_cm, (c.dimensiones_tipicas->'profundidad'->>'default')::numeric,  5) AS profundidad_cm,
    CASE
      WHEN s.alto_cm IS NOT NULL AND s.ancho_cm IS NOT NULL AND s.profundidad_cm IS NOT NULL THEN 'sku'
      WHEN c.dimensiones_tipicas IS NOT NULL THEN 'categoria'
      ELSE 'default'
    END AS fuente
  FROM public.skus s
  LEFT JOIN public.categorias c ON c.id = s.categoria_id
  WHERE s.id = ANY(p_sku_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_dimensiones_skus TO authenticated;

-- ============================================================================
-- 6) get_planograma_con_kpis: expone ancho_cm/alto_bandeja_cm del planograma
-- y las dimensiones efectivas (sku override -> default de categoria) de
-- cada SKU en sus slots, para que el simulador pueda calcular capacidad
-- fisica por bandeja sin llamadas adicionales.
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
    'id',              p.id,
    'nombre',          p.nombre,
    'n_bandejas',      p.n_bandejas,
    'n_posiciones',    p.n_posiciones,
    'ancho_cm',        p.ancho_cm,
    'alto_bandeja_cm', p.alto_bandeja_cm,
    'fecha_desde',     p.fecha_vigencia_desde,
    'fecha_hasta',     p.fecha_vigencia_hasta,
    'tienda',          json_build_object('id', t.id, 'nombre', t.nombre, 'ciudad', t.ciudad),
    'categoria',       json_build_object('id', cat.id, 'nombre', cat.nombre, 'ruta', cat.ruta),
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
            'id',            s.id,
            'nombre',        s.nombre,
            'sku_externo',   s.sku_externo,
            'imagen_url',    s.imagen_url,
            'precio_lista',  s.precio_lista,
            'marca_nombre',  mar.nombre,
            'categoria_id',  s.categoria_id,
            'alto_cm',       COALESCE(s.alto_cm,        (c.dimensiones_tipicas->'alto'->>'default')::numeric,        10),
            'ancho_cm',      COALESCE(s.ancho_cm,       (c.dimensiones_tipicas->'ancho'->>'default')::numeric,        5),
            'profundidad_cm',COALESCE(s.profundidad_cm, (c.dimensiones_tipicas->'profundidad'->>'default')::numeric,  5)
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
      LEFT JOIN public.marcas     mar ON mar.id = s.marca_id
      LEFT JOIN public.categorias c   ON c.id   = s.categoria_id
      WHERE ps.planograma_id = p.id
    )
  )
  FROM public.planogramas p
  JOIN public.tiendas     t   ON t.id   = p.tienda_id
  JOIN public.categorias  cat ON cat.id = p.categoria_id
  WHERE p.id = p_planograma_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_planograma_con_kpis TO authenticated;

-- ============================================================================
-- 7) crear_planograma_generado: acepta ancho_cm/alto_bandeja_cm opcionales
-- del fixture real (wizard de creacion), para que el planograma nazca con
-- capacidad fisica conocida en vez de depender siempre del fallback estimado.
-- ============================================================================
DROP FUNCTION IF EXISTS public.crear_planograma_generado(TEXT, UUID, UUID, INT, INT, JSONB);

CREATE OR REPLACE FUNCTION public.crear_planograma_generado(
  p_nombre          TEXT,
  p_tienda_id       UUID,
  p_categoria_id    UUID,
  p_n_bandejas      INT,
  p_n_posiciones    INT,
  p_slots           JSONB,   -- [{bandeja, posicion, sku_id}]
  p_ancho_cm        NUMERIC DEFAULT NULL,
  p_alto_bandeja_cm NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_planograma_id UUID;
  v_slot          JSONB;
BEGIN
  INSERT INTO public.planogramas (
    nombre, tienda_id, categoria_id, n_bandejas, n_posiciones,
    fecha_vigencia_desde, ancho_cm, alto_bandeja_cm
  )
  VALUES (
    p_nombre, p_tienda_id, p_categoria_id, p_n_bandejas::smallint, p_n_posiciones::smallint,
    CURRENT_DATE, p_ancho_cm, p_alto_bandeja_cm
  )
  RETURNING id INTO v_planograma_id;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    INSERT INTO public.planograma_slots (planograma_id, bandeja, posicion, sku_id, frente)
    VALUES (
      v_planograma_id,
      (v_slot->>'bandeja')::smallint,
      (v_slot->>'posicion')::smallint,
      (v_slot->>'sku_id')::uuid,
      1
    );
  END LOOP;

  RETURN v_planograma_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.crear_planograma_generado TO authenticated;
