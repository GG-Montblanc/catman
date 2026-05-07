-- 0030_planogram_generator.sql
-- RPCs para generación automática de planogramas
-- Depende de: 0001_catalog.sql, 0010_mv_kpis.sql, 0020_planogramas.sql

-- ============================================================================
-- RPC: get_skus_para_generar
-- Devuelve SKUs de una categoría (y sus subcategorías) con KPIs promedio
-- para los últimos p_meses meses. Si la tienda no tiene datos propios, usa el
-- promedio global de todas las tiendas (COALESCE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_skus_para_generar(
  p_categoria_id  UUID,
  p_tienda_id     UUID,
  p_meses         INT DEFAULT 3
)
RETURNS TABLE (
  sku_id            UUID,
  nombre            TEXT,
  marca_nombre      TEXT,
  subfamilia_nombre TEXT,
  avg_gmroi         NUMERIC,
  avg_margen_pct    NUMERIC,
  total_unidades    BIGINT,
  imagen_url        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Ventana temporal: último día del mes actual hacia atrás p_meses meses
  WITH fecha_corte AS (
    SELECT
      date_trunc('month', CURRENT_DATE)::date                              AS mes_fin,
      (date_trunc('month', CURRENT_DATE) - (p_meses || ' months')::interval)::date AS mes_inicio
  ),

  -- SKUs activos dentro de la categoría raíz y todas sus subcategorías
  skus_categoria AS (
    SELECT
      s.id            AS sku_id,
      s.nombre,
      s.imagen_url,
      mar.nombre      AS marca_nombre,
      -- subfamilia = la categoría de nivel 2 ancestral del SKU (si existe)
      (
        SELECT cat2.nombre
        FROM public.categorias cat2
        WHERE cat2.nivel = 2
          AND (
            -- el SKU pertenece directamente a esa categoría
            cat2.id = s.categoria_id
            -- o la categoría del SKU es descendiente de esa categoría nivel 2
            OR EXISTS (
              SELECT 1 FROM public.categorias cdesc
              WHERE cdesc.id = s.categoria_id
                AND cdesc.ruta LIKE cat2.ruta || '/%'
                AND cdesc.parent_id = cat2.id
            )
          )
          -- y esa categoría nivel 2 es descendiente de la categoría raíz solicitada
          AND (
            cat2.id = p_categoria_id
            OR cat2.ruta LIKE (
              SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id
            )
          )
        LIMIT 1
      ) AS subfamilia_nombre
    FROM public.skus s
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE s.activo = true
      AND s.categoria_id IN (
        -- la categoría raíz exacta o cualquier descendiente
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (
             SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id
           )
      )
  ),

  -- KPIs de la tienda específica en el período
  kpis_tienda AS (
    SELECT
      m.sku_id,
      ROUND(AVG(m.gmroi)       FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 4) AS avg_gmroi,
      ROUND(AVG(m.margen_pct)  FILTER (WHERE m.margen_pct IS NOT NULL), 4)       AS avg_margen_pct,
      SUM(m.unidades)                                                              AS total_unidades
    FROM public.mv_sku_kpis_mensual m
    WHERE m.tienda_id = p_tienda_id
      AND m.anio_mes >= (SELECT mes_inicio FROM fecha_corte)
      AND m.anio_mes <  (SELECT mes_fin    FROM fecha_corte)
    GROUP BY m.sku_id
  ),

  -- KPIs globales (todas las tiendas) como fallback
  kpis_global AS (
    SELECT
      m.sku_id,
      ROUND(AVG(m.gmroi)       FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 4) AS avg_gmroi,
      ROUND(AVG(m.margen_pct)  FILTER (WHERE m.margen_pct IS NOT NULL), 4)       AS avg_margen_pct,
      SUM(m.unidades)                                                              AS total_unidades
    FROM public.mv_sku_kpis_mensual m
    WHERE m.anio_mes >= (SELECT mes_inicio FROM fecha_corte)
      AND m.anio_mes <  (SELECT mes_fin    FROM fecha_corte)
    GROUP BY m.sku_id
  )

  SELECT
    sc.sku_id,
    sc.nombre,
    sc.marca_nombre,
    sc.subfamilia_nombre,
    -- preferir KPIs de tienda; si NULL usar global
    COALESCE(kt.avg_gmroi,      kg.avg_gmroi)      AS avg_gmroi,
    COALESCE(kt.avg_margen_pct, kg.avg_margen_pct) AS avg_margen_pct,
    COALESCE(kt.total_unidades, kg.total_unidades) AS total_unidades,
    sc.imagen_url
  FROM skus_categoria sc
  LEFT JOIN kpis_tienda kt ON kt.sku_id = sc.sku_id
  LEFT JOIN kpis_global kg ON kg.sku_id = sc.sku_id
  -- incluir solo SKUs que tienen algún dato KPI (tienda o global)
  WHERE kt.sku_id IS NOT NULL OR kg.sku_id IS NOT NULL
  ORDER BY COALESCE(kt.avg_gmroi, kg.avg_gmroi) DESC NULLS LAST;
$$;

-- ============================================================================
-- RPC: crear_planograma_generado
-- Inserta un planograma nuevo con sus slots y retorna el UUID creado.
-- p_slots: JSONB array de {bandeja: int, posicion: int, sku_id: uuid}
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crear_planograma_generado(
  p_nombre        TEXT,
  p_tienda_id     UUID,
  p_categoria_id  UUID,
  p_n_bandejas    INT,
  p_n_posiciones  INT,
  p_slots         JSONB   -- [{bandeja, posicion, sku_id}]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_planograma_id UUID;
  v_slot          JSONB;
BEGIN
  -- 1. Crear el planograma
  INSERT INTO public.planogramas (
    nombre,
    tienda_id,
    categoria_id,
    n_bandejas,
    n_posiciones,
    fecha_vigencia_desde
  )
  VALUES (
    p_nombre,
    p_tienda_id,
    p_categoria_id,
    p_n_bandejas::smallint,
    p_n_posiciones::smallint,
    CURRENT_DATE
  )
  RETURNING id INTO v_planograma_id;

  -- 2. Insertar slots
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    INSERT INTO public.planograma_slots (
      planograma_id,
      bandeja,
      posicion,
      sku_id,
      frente
    )
    VALUES (
      v_planograma_id,
      (v_slot->>'bandeja')::smallint,
      (v_slot->>'posicion')::smallint,
      (v_slot->>'sku_id')::uuid,
      1  -- frente por defecto
    );
  END LOOP;

  -- 3. Retornar el UUID del planograma creado
  RETURN v_planograma_id;
END;
$$;

-- ============================================================================
-- Grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_skus_para_generar    TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_planograma_generado TO authenticated;
GRANT INSERT  ON public.planogramas      TO authenticated;
GRANT INSERT  ON public.planograma_slots TO authenticated;
