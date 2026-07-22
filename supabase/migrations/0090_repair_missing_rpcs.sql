-- 0090_repair_missing_rpcs.sql
-- 18 funciones que estaban definidas en migraciones anteriores pero nunca se aplicaron
-- a la base de datos real (probablemente por un reset/restore parcial del proyecto).
-- Re-crea exactamente las mismas funciones (CREATE OR REPLACE, idempotente y seguro).

-- ============ refresh_kpi_views  (from 0010_mv_kpis.sql) ============
CREATE OR REPLACE FUNCTION public.refresh_kpi_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sku_kpis_mensual;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_kpi_views TO authenticated;

-- ============ get_planograma_con_kpis  (from 0020_planogramas.sql) ============
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
    'id',            p.id,
    'nombre',        p.nombre,
    'n_bandejas',    p.n_bandejas,
    'n_posiciones',  p.n_posiciones,
    'fecha_desde',   p.fecha_vigencia_desde,
    'fecha_hasta',   p.fecha_vigencia_hasta,
    'tienda',        json_build_object('id', t.id, 'nombre', t.nombre, 'ciudad', t.ciudad),
    'categoria',     json_build_object('id', cat.id, 'nombre', cat.nombre, 'ruta', cat.ruta),
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
            'id',           s.id,
            'nombre',       s.nombre,
            'sku_externo',  s.sku_externo,
            'imagen_url',   s.imagen_url,
            'precio_lista', s.precio_lista,
            'marca_nombre', mar.nombre,
            'categoria_id', s.categoria_id
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
      LEFT JOIN public.marcas mar ON mar.id = s.marca_id
      WHERE ps.planograma_id = p.id
    )
  )
  FROM public.planogramas p
  JOIN public.tiendas     t   ON t.id   = p.tienda_id
  JOIN public.categorias  cat ON cat.id = p.categoria_id
  WHERE p.id = p_planograma_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_planograma_con_kpis TO authenticated;

-- ============ get_swap_candidatos  (from 0020_planogramas.sql) ============
CREATE OR REPLACE FUNCTION public.get_swap_candidatos(
  p_sku_id        uuid,
  p_planograma_id uuid,
  p_modo          text  DEFAULT 'categoria',  -- 'categoria' | 'marca'
  p_desde         date  DEFAULT (CURRENT_DATE - INTERVAL '12 months')::date,
  p_hasta         date  DEFAULT CURRENT_DATE::date,
  p_limit         int   DEFAULT 20
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH tienda AS (
    SELECT tienda_id FROM public.planogramas WHERE id = p_planograma_id
  ),
  current_sku AS (
    SELECT s.categoria_id, s.marca_id FROM public.skus s WHERE s.id = p_sku_id
  ),
  current_kpis AS (
    SELECT
      ROUND(AVG(gmroi)        FILTER (WHERE gmroi > 0 AND gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(sellthru_pct) FILTER (WHERE sellthru_pct IS NOT NULL), 2)  AS avg_sellthru,
      ROUND(AVG(margen_pct)   FILTER (WHERE margen_pct IS NOT NULL), 2)    AS avg_margen_pct,
      ROUND(AVG(mdi_meses), 2) AS avg_mdi,
      SUM(ingreso)              AS total_ingreso,
      SUM(margen)               AS total_margen
    FROM public.mv_sku_kpis_mensual
    WHERE sku_id    = p_sku_id
      AND tienda_id = (SELECT tienda_id FROM tienda)
      AND anio_mes BETWEEN p_desde AND p_hasta
  ),
  candidatos AS (
    SELECT
      s.id, s.nombre, s.imagen_url, s.precio_lista, s.sku_externo,
      mar.nombre AS marca_nombre,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL), 2)    AS avg_sellthru,
      ROUND(AVG(m.margen_pct)   FILTER (WHERE m.margen_pct IS NOT NULL), 2)      AS avg_margen_pct,
      ROUND(AVG(m.mdi_meses), 2) AS avg_mdi,
      SUM(m.ingreso)              AS total_ingreso,
      SUM(m.margen)               AS total_margen
    FROM public.skus s
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    LEFT JOIN public.mv_sku_kpis_mensual m
           ON m.sku_id    = s.id
          AND m.tienda_id = (SELECT tienda_id FROM tienda)
          AND m.anio_mes BETWEEN p_desde AND p_hasta
    WHERE s.activo = true
      AND s.id != p_sku_id
      AND (
        CASE p_modo
          WHEN 'marca'     THEN s.marca_id = (SELECT marca_id FROM current_sku)
          ELSE                  s.categoria_id = (SELECT categoria_id FROM current_sku)
        END
      )
      -- No incluir SKUs ya asignados en otro slot del planograma
      AND s.id NOT IN (
        SELECT sku_id FROM public.planograma_slots
        WHERE planograma_id = p_planograma_id AND sku_id != p_sku_id
      )
    GROUP BY s.id, s.nombre, s.imagen_url, s.precio_lista, s.sku_externo, mar.nombre
    ORDER BY AVG(m.gmroi) FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100) DESC NULLS LAST
    LIMIT p_limit
  )
  SELECT json_build_object(
    'current_kpis', (SELECT row_to_json(ck) FROM current_kpis ck),
    'candidatos', (
      SELECT json_agg(
        json_build_object(
          'id',             c.id,
          'nombre',         c.nombre,
          'imagen_url',     c.imagen_url,
          'precio_lista',   c.precio_lista,
          'sku_externo',    c.sku_externo,
          'marca_nombre',   c.marca_nombre,
          'avg_gmroi',      c.avg_gmroi,
          'avg_sellthru',   c.avg_sellthru,
          'avg_margen_pct', c.avg_margen_pct,
          'avg_mdi',        c.avg_mdi,
          'total_ingreso',  c.total_ingreso,
          'total_margen',   c.total_margen,
          -- deltas vs current SKU
          'delta_gmroi',      ROUND(c.avg_gmroi      - (SELECT avg_gmroi      FROM current_kpis), 2),
          'delta_sellthru',   ROUND(c.avg_sellthru   - (SELECT avg_sellthru   FROM current_kpis), 2),
          'delta_margen_pct', ROUND(c.avg_margen_pct - (SELECT avg_margen_pct FROM current_kpis), 2),
          'delta_ingreso',    ROUND(c.total_ingreso  - (SELECT total_ingreso  FROM current_kpis), 0)
        )
      )
      FROM candidatos c
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_swap_candidatos TO authenticated;

-- ============ guardar_version_planograma  (from 0020_planogramas.sql) ============
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
  v_version int;
  v_swap    json;
BEGIN
  -- Calcular próxima versión
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.planograma_versiones
  WHERE planograma_id = p_planograma_id;

  -- Guardar snapshot del estado actual ANTES de los cambios
  INSERT INTO public.planograma_versiones (planograma_id, version, snapshot, comentario)
  SELECT
    p_planograma_id,
    v_version,
    (SELECT json_agg(json_build_object(
        'slot_id', ps.id, 'bandeja', ps.bandeja, 'posicion', ps.posicion,
        'sku_id', ps.sku_id, 'frente', ps.frente
      ))
     FROM public.planograma_slots ps WHERE ps.planograma_id = p_planograma_id),
    p_comentario;

  -- Aplicar swaps
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

-- ============ crear_planograma_generado  (from 0030_planogram_generator.sql) ============
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
GRANT EXECUTE ON FUNCTION public.crear_planograma_generado TO authenticated;

-- ============ get_skus_para_generar  (from 0030_planogram_generator.sql) ============
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
GRANT EXECUTE ON FUNCTION public.get_skus_para_generar TO authenticated;

-- ============ get_planograma_por_token  (from 0031_reponedor.sql) ============
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
GRANT EXECUTE ON FUNCTION public.get_planograma_por_token   TO anon, authenticated;

-- ============ publicar_planograma  (from 0031_reponedor.sql) ============
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
GRANT EXECUTE ON FUNCTION public.publicar_planograma TO authenticated;

-- ============ get_compras_sugeridas  (from 0040_forecast.sql) ============
CREATE OR REPLACE FUNCTION public.get_compras_sugeridas(
  p_tienda_id    UUID DEFAULT NULL,
  p_categoria_id UUID DEFAULT NULL
)
RETURNS TABLE (
  sku_id             UUID,
  nombre             TEXT,
  marca_nombre       TEXT,
  stock_actual       NUMERIC,
  mdi_actual         NUMERIC,
  avg_ventas_mensual NUMERIC,
  precio_lista       NUMERIC,
  unidades_sugeridas INT,
  valor_orden        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  -- Promedio de ventas de los últimos 6 meses por SKU (agregado o por tienda)
  ventas_base AS (
    SELECT
      v.sku_id,
      ROUND(
        AVG(
          CASE WHEN p_tienda_id IS NULL THEN total_mes ELSE v.unidades END
        )::numeric,
        2
      ) AS avg_ventas_mensual
    FROM (
      SELECT
        sku_id,
        anio_mes,
        SUM(unidades) AS total_mes
      FROM public.ventas_fact
      WHERE anio_mes >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months')::DATE
        AND (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
      GROUP BY sku_id, anio_mes
    ) v
    GROUP BY v.sku_id
  ),
  -- Inventario más reciente por SKU
  inv_actual AS (
    SELECT DISTINCT ON (i.sku_id)
      i.sku_id,
      i.stock_fin   AS stock_actual,
      i.mdi_meses
    FROM public.inventario_fact i
    WHERE (p_tienda_id IS NULL OR i.tienda_id = p_tienda_id)
    ORDER BY i.sku_id, i.anio_mes DESC
  )
  SELECT
    s.id                                                       AS sku_id,
    s.nombre                                                   AS nombre,
    mar.nombre                                                 AS marca_nombre,
    COALESCE(ia.stock_actual, 0)                               AS stock_actual,
    COALESCE(ia.mdi_meses, 0)                                  AS mdi_actual,
    COALESCE(vb.avg_ventas_mensual, 0)                         AS avg_ventas_mensual,
    s.precio_lista                                             AS precio_lista,
    GREATEST(
      0,
      ROUND(COALESCE(vb.avg_ventas_mensual, 0) * 5)
        - COALESCE(ia.stock_actual, 0)
    )::INT                                                     AS unidades_sugeridas,
    GREATEST(
      0,
      (
        ROUND(COALESCE(vb.avg_ventas_mensual, 0) * 5)
          - COALESCE(ia.stock_actual, 0)
      ) * s.precio_lista
    )                                                          AS valor_orden
  FROM public.skus s
  LEFT JOIN public.marcas     mar ON mar.id = s.marca_id
  LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
  LEFT JOIN ventas_base        vb ON vb.sku_id  = s.id
  LEFT JOIN inv_actual         ia ON ia.sku_id  = s.id
  WHERE s.activo = true
    AND (
      p_categoria_id IS NULL
      OR s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (
             (SELECT ruta FROM public.categorias WHERE id = p_categoria_id)
             || '/%'
           )
      )
    )
    -- Solo mostrar SKUs donde se sugiere comprar algo
    AND GREATEST(
      0,
      ROUND(COALESCE(vb.avg_ventas_mensual, 0) * 5)
        - COALESCE(ia.stock_actual, 0)
    ) > 0
  ORDER BY valor_orden DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.get_compras_sugeridas TO authenticated;

-- ============ get_atributos_disponibles  (from 0050_tendencias.sql) ============
CREATE OR REPLACE FUNCTION public.get_atributos_disponibles(p_categoria_id UUID)
RETURNS TABLE(atributo TEXT, n_valores BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT k, COUNT(DISTINCT s.atributos->>k)
  FROM public.skus s,
       LATERAL jsonb_object_keys(s.atributos) k
  WHERE s.activo = true
    AND s.atributos IS NOT NULL
    AND s.atributos != '{}'::jsonb
    AND s.categoria_id IN (
      SELECT id FROM public.categorias
      WHERE id = p_categoria_id
         OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
    )
  GROUP BY k
  HAVING COUNT(DISTINCT s.atributos->>k) > 1
  ORDER BY COUNT(DISTINCT s.atributos->>k) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_atributos_disponibles TO authenticated;

-- ============ get_skus_mdi  (from 0050_tendencias.sql) ============
CREATE OR REPLACE FUNCTION public.get_skus_mdi(
  p_tienda_id    UUID DEFAULT NULL,
  p_categoria_id UUID DEFAULT NULL,
  p_mdi_min      NUMERIC DEFAULT 0,
  p_mdi_max      NUMERIC DEFAULT 36,
  p_limit        INT DEFAULT 200
)
RETURNS TABLE(
  sku_id             UUID,
  nombre             TEXT,
  marca_nombre       TEXT,
  categoria_nombre   TEXT,
  imagen_url         TEXT,
  precio_lista       NUMERIC,
  mdi_actual         NUMERIC,
  stock_actual       NUMERIC,
  avg_ventas_mensual NUMERIC,
  valor_inventario   NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ultimo_mes AS (
    SELECT MAX(anio_mes) AS mes FROM public.inventario_fact
    WHERE (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
  ),
  inv AS (
    SELECT
      sku_id,
      AVG(mdi_meses)::NUMERIC   AS mdi_actual,
      AVG(stock_fin)::NUMERIC   AS stock_actual,
      AVG(costo_inventario)::NUMERIC AS valor_inventario
    FROM public.inventario_fact
    WHERE anio_mes = (SELECT mes FROM ultimo_mes)
      AND (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
    GROUP BY sku_id
  ),
  ventas_prom AS (
    SELECT
      sku_id,
      AVG(unidades)::NUMERIC AS avg_ventas_mensual
    FROM public.ventas_fact
    WHERE anio_mes >= date_trunc('month', CURRENT_DATE - '3 months'::interval)::date
      AND (p_tienda_id IS NULL OR tienda_id = p_tienda_id)
    GROUP BY sku_id
  )
  SELECT
    s.id           AS sku_id,
    s.nombre,
    mar.nombre     AS marca_nombre,
    cat.nombre     AS categoria_nombre,
    s.imagen_url,
    s.precio_lista,
    COALESCE(i.mdi_actual, 0)         AS mdi_actual,
    COALESCE(i.stock_actual, 0)       AS stock_actual,
    COALESCE(vp.avg_ventas_mensual,0) AS avg_ventas_mensual,
    COALESCE(i.valor_inventario, 0)   AS valor_inventario
  FROM public.skus s
  JOIN inv i ON i.sku_id = s.id
  LEFT JOIN ventas_prom vp ON vp.sku_id = s.id
  LEFT JOIN public.marcas mar ON mar.id = s.marca_id
  LEFT JOIN public.categorias cat ON cat.id = s.categoria_id
  WHERE s.activo = true
    AND COALESCE(i.mdi_actual, 0) BETWEEN p_mdi_min AND p_mdi_max
    AND (p_categoria_id IS NULL OR s.categoria_id IN (
      SELECT id FROM public.categorias
      WHERE id = p_categoria_id
         OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
    ))
  ORDER BY i.mdi_actual DESC NULLS LAST
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_skus_mdi              TO authenticated;

-- ============ get_tendencias_atributo  (from 0050_tendencias.sql) ============
CREATE OR REPLACE FUNCTION public.get_tendencias_atributo(
  p_categoria_id UUID,
  p_atributo     TEXT,
  p_meses        INT DEFAULT 12
)
RETURNS TABLE(
  valor          TEXT,
  mes            DATE,
  total_unidades BIGINT,
  total_ingreso  NUMERIC,
  pct_categoria  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH skus_cat AS (
    SELECT s.id, s.atributos->>p_atributo AS val
    FROM public.skus s
    WHERE s.activo = true
      AND s.atributos IS NOT NULL
      AND s.atributos->>p_atributo IS NOT NULL
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
      )
  ),
  ventana AS (
    SELECT date_trunc('month', CURRENT_DATE - ((p_meses-1)||' months')::interval)::date AS inicio
  ),
  por_valor AS (
    SELECT
      sc.val AS valor,
      vf.anio_mes AS mes,
      SUM(vf.unidades)::BIGINT AS total_unidades,
      SUM(vf.ingreso)::NUMERIC AS total_ingreso
    FROM public.ventas_fact vf
    JOIN skus_cat sc ON sc.id = vf.sku_id
    WHERE vf.anio_mes >= (SELECT inicio FROM ventana)
    GROUP BY sc.val, vf.anio_mes
  ),
  total_cat AS (
    SELECT vf.anio_mes AS mes, SUM(vf.ingreso) AS total_cat_ingreso
    FROM public.ventas_fact vf
    JOIN public.skus s ON s.id = vf.sku_id
    WHERE s.categoria_id IN (
      SELECT id FROM public.categorias
      WHERE id = p_categoria_id
         OR ruta LIKE (SELECT ruta||'/%' FROM public.categorias WHERE id = p_categoria_id)
    )
    AND vf.anio_mes >= (SELECT inicio FROM ventana)
    GROUP BY vf.anio_mes
  )
  SELECT
    pv.valor,
    pv.mes,
    pv.total_unidades,
    pv.total_ingreso,
    ROUND(100.0 * pv.total_ingreso / NULLIF(tc.total_cat_ingreso, 0), 2) AS pct_categoria
  FROM por_valor pv
  LEFT JOIN total_cat tc ON tc.mes = pv.mes
  ORDER BY pv.mes, pv.total_ingreso DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_tendencias_atributo TO authenticated;

-- ============ get_categoria_detalle  (from 0060_categorias_tiendas.sql) ============
CREATE OR REPLACE FUNCTION public.get_categoria_detalle(
  p_categoria_id UUID,
  p_meses        INT DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_inicio       DATE;
  v_kpis         JSON;
  v_top_skus     JSON;
  v_bottom_skus  JSON;
  v_evolucion    JSON;
  v_subfamilias  JSON;
BEGIN
  v_inicio := date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date;

  -- KPIs globales de la categoría
  SELECT row_to_json(q) INTO v_kpis
  FROM (
    SELECT
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(SUM(k.ingreso), 0)                                                     AS total_ingreso,
      SUM(k.unidades)::BIGINT                                                      AS total_unidades,
      COUNT(DISTINCT k.sku_id)::BIGINT                                             AS n_skus
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
  ) q;

  -- Top 10 SKUs por GMROI
  SELECT json_agg(q) INTO v_top_skus
  FROM (
    SELECT
      s.id         AS sku_id,
      s.nombre,
      mar.nombre   AS marca,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi,
      ROUND(AVG(k.sellthru_pct), 2)                                         AS sellthru,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      s.imagen_url
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
    GROUP BY s.id, s.nombre, mar.nombre, s.imagen_url
    HAVING SUM(k.unidades) > 0
    ORDER BY AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) DESC NULLS LAST
    LIMIT 10
  ) q;

  -- Bottom 5 SKUs (menor GMROI, con ventas > 0)
  SELECT json_agg(q) INTO v_bottom_skus
  FROM (
    SELECT
      s.id         AS sku_id,
      s.nombre,
      mar.nombre   AS marca,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi,
      ROUND(AVG(k.sellthru_pct), 2)                                         AS sellthru,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      s.imagen_url
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
    GROUP BY s.id, s.nombre, mar.nombre, s.imagen_url
    HAVING SUM(k.unidades) > 0
       AND AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) IS NOT NULL
    ORDER BY AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) ASC NULLS LAST
    LIMIT 5
  ) q;

  -- Evolución mensual de GMROI
  SELECT json_agg(q ORDER BY q.mes) INTO v_evolucion
  FROM (
    SELECT
      to_char(k.anio_mes, 'YYYY-MM') AS mes,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    WHERE k.anio_mes >= v_inicio
      AND s.categoria_id IN (
        SELECT id FROM public.categorias
        WHERE id = p_categoria_id
           OR ruta LIKE (SELECT ruta || '/%' FROM public.categorias WHERE id = p_categoria_id)
      )
    GROUP BY k.anio_mes
  ) q;

  -- Desglose por subfamilia (nivel directo + 1, o nivel 2 relativo)
  SELECT json_agg(q ORDER BY q.ingreso DESC) INTO v_subfamilias
  FROM (
    SELECT
      csub.nombre,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2)   AS gmroi,
      COUNT(DISTINCT k.sku_id)::BIGINT                                        AS n_skus
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    -- Buscar la subfamilia: categoría hija directa de p_categoria_id que es ancestro del SKU
    JOIN public.categorias csub ON (
      csub.parent_id = p_categoria_id
      AND (
        s.categoria_id = csub.id
        OR s.categoria_id IN (
          SELECT id FROM public.categorias
          WHERE ruta LIKE csub.ruta || '/%'
        )
      )
    )
    WHERE k.anio_mes >= v_inicio
    GROUP BY csub.nombre
    HAVING SUM(k.unidades) > 0
  ) q;

  RETURN json_build_object(
    'kpis',        v_kpis,
    'top_skus',    COALESCE(v_top_skus,    '[]'::json),
    'bottom_skus', COALESCE(v_bottom_skus, '[]'::json),
    'evolucion',   COALESCE(v_evolucion,   '[]'::json),
    'subfamilias', COALESCE(v_subfamilias, '[]'::json)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_categoria_detalle TO authenticated;

-- ============ get_tienda_detalle  (from 0060_categorias_tiendas.sql) ============
CREATE OR REPLACE FUNCTION public.get_tienda_detalle(
  p_tienda_id UUID,
  p_meses     INT DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_inicio        DATE;
  v_formato       TEXT;
  v_kpis          JSON;
  v_benchmark     JSON;
  v_top_cats      JSON;
  v_evolucion     JSON;
  v_top_skus      JSON;
BEGIN
  v_inicio := date_trunc('month', CURRENT_DATE - ((p_meses - 1) || ' months')::interval)::date;

  -- Obtener formato de la tienda
  SELECT formato INTO v_formato FROM public.tiendas WHERE id = p_tienda_id;

  -- KPIs globales de la tienda
  SELECT row_to_json(q) INTO v_kpis
  FROM (
    SELECT
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(SUM(k.ingreso), 0)                                                     AS total_ingreso,
      SUM(k.unidades)::BIGINT                                                      AS total_unidades,
      COUNT(DISTINCT k.sku_id)::BIGINT                                             AS n_skus
    FROM public.mv_sku_kpis_mensual k
    WHERE k.tienda_id = p_tienda_id
      AND k.anio_mes >= v_inicio
  ) q;

  -- Benchmark: promedio de todas las tiendas del mismo formato
  SELECT row_to_json(q) INTO v_benchmark
  FROM (
    SELECT
      ROUND(AVG(k.gmroi)        FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(k.sellthru_pct) FILTER (WHERE k.sellthru_pct IS NOT NULL), 2)     AS avg_sellthru,
      ROUND(AVG(k.margen_pct)   FILTER (WHERE k.margen_pct IS NOT NULL), 2)       AS avg_margen_pct,
      ROUND(AVG(sub.t_ingreso), 0)                                                  AS avg_ingreso
    FROM public.mv_sku_kpis_mensual k
    JOIN public.tiendas t ON t.id = k.tienda_id
    JOIN (
      SELECT k2.tienda_id, SUM(k2.ingreso) AS t_ingreso
      FROM public.mv_sku_kpis_mensual k2
      WHERE k2.anio_mes >= v_inicio
      GROUP BY k2.tienda_id
    ) sub ON sub.tienda_id = k.tienda_id
    WHERE t.formato = v_formato
      AND k.anio_mes >= v_inicio
  ) q;

  -- Top 5 categorías por ingreso (con GMROI)
  SELECT json_agg(q ORDER BY q.ingreso DESC) INTO v_top_cats
  FROM (
    SELECT
      c.nombre,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2)   AS gmroi
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    JOIN public.categorias c ON c.id = s.categoria_id
    WHERE k.tienda_id = p_tienda_id
      AND k.anio_mes >= v_inicio
    GROUP BY c.nombre
    HAVING SUM(k.unidades) > 0
    ORDER BY SUM(k.ingreso) DESC
    LIMIT 5
  ) q;

  -- Evolución mensual: tienda + promedio formato
  SELECT json_agg(q ORDER BY q.mes) INTO v_evolucion
  FROM (
    WITH tienda_mes AS (
      SELECT
        to_char(k.anio_mes, 'YYYY-MM') AS mes,
        ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi_tienda
      FROM public.mv_sku_kpis_mensual k
      WHERE k.tienda_id = p_tienda_id
        AND k.anio_mes >= v_inicio
      GROUP BY k.anio_mes
    ),
    formato_mes AS (
      SELECT
        to_char(k.anio_mes, 'YYYY-MM') AS mes,
        ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi_formato
      FROM public.mv_sku_kpis_mensual k
      JOIN public.tiendas t ON t.id = k.tienda_id
      WHERE t.formato = v_formato
        AND k.anio_mes >= v_inicio
      GROUP BY k.anio_mes
    )
    SELECT
      tm.mes,
      tm.gmroi_tienda,
      fm.gmroi_formato
    FROM tienda_mes tm
    LEFT JOIN formato_mes fm ON fm.mes = tm.mes
  ) q;

  -- Top 10 SKUs de la tienda por GMROI
  SELECT json_agg(q) INTO v_top_skus
  FROM (
    SELECT
      s.id         AS sku_id,
      s.nombre,
      mar.nombre   AS marca,
      ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2) AS gmroi,
      ROUND(AVG(k.sellthru_pct), 2)                                         AS sellthru,
      ROUND(SUM(k.ingreso), 0)                                               AS ingreso,
      s.imagen_url
    FROM public.mv_sku_kpis_mensual k
    JOIN public.skus s ON s.id = k.sku_id
    LEFT JOIN public.marcas mar ON mar.id = s.marca_id
    WHERE k.tienda_id = p_tienda_id
      AND k.anio_mes >= v_inicio
    GROUP BY s.id, s.nombre, mar.nombre, s.imagen_url
    HAVING SUM(k.unidades) > 0
    ORDER BY AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100) DESC NULLS LAST
    LIMIT 10
  ) q;

  RETURN json_build_object(
    'kpis',       v_kpis,
    'benchmark',  v_benchmark,
    'top_cats',   COALESCE(v_top_cats,  '[]'::json),
    'evolucion',  COALESCE(v_evolucion, '[]'::json),
    'top_skus',   COALESCE(v_top_skus,  '[]'::json)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_tienda_detalle TO authenticated;

-- ============ guardar_version_planograma  (from 0076_version_snapshot_v2.sql) ============
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
  v_version   int;
  v_swap      json;
  v_snapshot  json;
  v_swaps_detail json;
BEGIN
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

  -- Persist version with both slot snapshot + swap details
  INSERT INTO public.planograma_versiones (planograma_id, version, snapshot, comentario)
  VALUES (
    p_planograma_id,
    v_version,
    json_build_object(
      'slots',      v_snapshot,
      'swaps',      v_swaps_detail,
      'slot_count', (SELECT COUNT(*) FROM public.planograma_slots WHERE planograma_id = p_planograma_id),
      'v',          2
    ),
    p_comentario
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

-- ============ guardar_version_planograma  (from 0077_catchup_y_seed.sql) ============
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

-- ============ get_planograma_mobile  (from 0080_planograma_templates_y_mobile.sql) ============
CREATE OR REPLACE FUNCTION public.get_planograma_mobile(p_planograma_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'planograma', jsonb_build_object(
      'id',                  pl.id,
      'nombre',              pl.nombre,
      'n_bandejas',          pl.n_bandejas,
      'n_posiciones',        pl.n_posiciones,
      'fecha_vigencia_desde',pl.fecha_vigencia_desde,
      'fecha_vigencia_hasta',pl.fecha_vigencia_hasta
    ),
    'tienda', jsonb_build_object(
      'id',       t.id,
      'nombre',   t.nombre,
      'ciudad',   t.ciudad,
      'formato',  t.formato,
      'direccion',t.direccion
    ),
    'categoria', jsonb_build_object(
      'id',     c.id,
      'nombre', c.nombre
    ),
    'bandejas', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'bandeja',   ps.bandeja,
          'posicion',  ps.posicion,
          'frente',    COALESCE(ps.frente, 1),
          'sku', jsonb_build_object(
            'id',         s.id,
            'nombre',     s.nombre,
            'marca',      m.nombre,
            'imagen_url', s.imagen_url,
            'precio_lista', s.precio_lista,
            'precio_oferta',s.precio_oferta
          ),
          'kpis', (
            SELECT jsonb_build_object(
              'avg_gmroi',    ROUND(AVG(k.gmroi) FILTER (WHERE k.gmroi > 0 AND k.gmroi < 100), 2),
              'avg_sellthru', ROUND(AVG(k.sellthru_pct), 2),
              'total_ingreso',ROUND(SUM(k.ingreso), 0),
              'avg_mdi',      ROUND(AVG(k.mdi_meses), 2)
            )
            FROM public.mv_sku_kpis_mensual k
            WHERE k.sku_id = ps.sku_id
              AND k.tienda_id = pl.tienda_id
              AND k.anio_mes >= CURRENT_DATE - INTERVAL '3 months'
          )
        )
        ORDER BY ps.bandeja ASC, ps.posicion ASC
      )
      FROM public.planograma_slots ps
      JOIN public.skus s ON s.id = ps.sku_id
      LEFT JOIN public.marcas m ON m.id = s.marca_id
      WHERE ps.planograma_id = pl.id
    )
  )
  INTO v_result
  FROM public.planogramas pl
  JOIN public.tiendas    t ON t.id = pl.tienda_id
  JOIN public.categorias c ON c.id = pl.categoria_id
  WHERE pl.id = p_planograma_id;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_planograma_mobile(UUID) TO authenticated;

-- ============ get_planograma_pedido  (from 0080_planograma_templates_y_mobile.sql) ============
CREATE OR REPLACE FUNCTION public.get_planograma_pedido(p_planograma_id UUID)
RETURNS TABLE (
  sku_id          UUID,
  sku_nombre      TEXT,
  marca_nombre    TEXT,
  imagen_url      TEXT,
  precio_lista    NUMERIC,
  frentes_total   BIGINT,   -- suma de frentes en todas las posiciones del planograma
  stock_actual    NUMERIC,  -- último stock conocido en esa tienda
  venta_mensual   NUMERIC,  -- ventas promedio último mes
  semanas_target  INT,      -- target de cobertura (default 10 semanas)
  unidades_target NUMERIC,  -- stock necesario para cubrir target
  unidades_pedir  NUMERIC,  -- max(0, target - stock_actual)
  costo_estimado  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH pl_info AS (
    SELECT pl.tienda_id, pl.categoria_id
    FROM public.planogramas pl
    WHERE pl.id = p_planograma_id
  ),
  slots_agg AS (
    SELECT
      ps.sku_id,
      SUM(COALESCE(ps.frente, 1)) AS frentes_total
    FROM public.planograma_slots ps
    WHERE ps.planograma_id = p_planograma_id
    GROUP BY ps.sku_id
  ),
  kpis_recientes AS (
    SELECT
      k.sku_id,
      AVG(k.ingreso / NULLIF(k.unidades, 0))        AS precio_unitario,
      AVG(k.unidades)                                AS venta_mensual,
      MAX(k.stock_fin)                               AS stock_actual,
      AVG(k.costo_inventario / NULLIF(k.stock_promedio, 0)) AS costo_unitario
    FROM public.mv_sku_kpis_mensual k
    JOIN pl_info ON k.tienda_id = pl_info.tienda_id
    WHERE k.anio_mes >= CURRENT_DATE - INTERVAL '2 months'
    GROUP BY k.sku_id
  )
  SELECT
    sa.sku_id,
    s.nombre                                         AS sku_nombre,
    m.nombre                                         AS marca_nombre,
    s.imagen_url,
    s.precio_lista,
    sa.frentes_total,
    COALESCE(kr.stock_actual,  0)                    AS stock_actual,
    COALESCE(kr.venta_mensual, 0)                    AS venta_mensual,
    10                                               AS semanas_target,
    ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0) AS unidades_target,
    GREATEST(0,
      ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0)
      - COALESCE(kr.stock_actual, 0)
    )                                                AS unidades_pedir,
    GREATEST(0,
      ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0)
      - COALESCE(kr.stock_actual, 0)
    ) * COALESCE(kr.costo_unitario, s.precio_lista * 0.6) AS costo_estimado
  FROM slots_agg sa
  JOIN public.skus   s ON s.id = sa.sku_id
  LEFT JOIN public.marcas m ON m.id = s.marca_id
  LEFT JOIN kpis_recientes kr ON kr.sku_id = sa.sku_id
  WHERE GREATEST(0,
    ROUND(COALESCE(kr.venta_mensual, 0) * 10 / 4, 0)
    - COALESCE(kr.stock_actual, 0)
  ) > 0
  ORDER BY unidades_pedir DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_planograma_pedido(UUID) TO authenticated;

-- ============ get_alertas_filtradas  (from 0081_mejoras_alertas_y_asignaciones.sql) ============
CREATE OR REPLACE FUNCTION public.get_alertas_filtradas(
  p_limit      INT     DEFAULT 200,
  p_tipo       TEXT    DEFAULT NULL,   -- 'dog' | 'sobrestock' | 'quiebre_riesgo' | 'obsoleto' | NULL (todos)
  p_severidad  INT     DEFAULT NULL    -- 1 | 2 | 3 | NULL (todos)
)
RETURNS TABLE (
  sku_id         UUID,
  sku_nombre     TEXT,
  marca_nombre   TEXT,
  tipo_alerta    TEXT,
  severidad      INT,
  descripcion    TEXT,
  valor_gmroi    NUMERIC,
  valor_mdi      NUMERIC,
  imagen_url     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  kpis AS (
    SELECT
      m.sku_id,
      ROUND(AVG(m.gmroi)        FILTER (WHERE m.gmroi > 0 AND m.gmroi < 100), 2) AS avg_gmroi,
      ROUND(AVG(m.sellthru_pct) FILTER (WHERE m.sellthru_pct IS NOT NULL),    2) AS avg_sellthru,
      ROUND(AVG(m.mdi_meses)    FILTER (WHERE m.mdi_meses IS NOT NULL),       2) AS avg_mdi,
      ROUND(AVG(m.fill_rate)    FILTER (WHERE m.fill_rate IS NOT NULL),       2) AS avg_fill_rate
    FROM public.mv_sku_kpis_mensual m
    WHERE m.anio_mes >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months')::DATE
    GROUP BY m.sku_id
  ),
  alertas AS (
    SELECT k.sku_id, 'dog'::TEXT AS tipo, 1 AS sev,
           'GMROI bajo y rotación lenta — candidato a liquidación' AS desc_,
           k.avg_gmroi, k.avg_mdi
    FROM kpis k
    WHERE k.avg_gmroi IS NOT NULL AND k.avg_gmroi < 0.5
      AND k.avg_sellthru IS NOT NULL AND k.avg_sellthru < 30

    UNION ALL

    SELECT k.sku_id, 'sobrestock'::TEXT,
           CASE WHEN k.avg_mdi > 12 THEN 1 ELSE 2 END,
           CASE WHEN k.avg_mdi > 12
             THEN 'Inventario crítico > 12 meses — revisar descontinuación'
             ELSE 'Inventario elevado (9–12 meses) — reducir próxima compra'
           END,
           k.avg_gmroi, k.avg_mdi
    FROM kpis k WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi > 9

    UNION ALL

    SELECT k.sku_id, 'quiebre_riesgo'::TEXT, 1,
           'Fill rate bajo y stock escaso — riesgo de quiebre inminente',
           k.avg_gmroi, k.avg_mdi
    FROM kpis k
    WHERE k.avg_fill_rate IS NOT NULL AND k.avg_fill_rate < 60
      AND k.avg_mdi IS NOT NULL AND k.avg_mdi < 1
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi > 0.8

    UNION ALL

    SELECT k.sku_id, 'obsoleto'::TEXT, 2,
           'GMROI aceptable pero inventario obsoleto — evaluar promoción agresiva',
           k.avg_gmroi, k.avg_mdi
    FROM kpis k
    WHERE k.avg_mdi IS NOT NULL AND k.avg_mdi BETWEEN 6 AND 9
      AND k.avg_gmroi IS NOT NULL AND k.avg_gmroi < 1.0
  ),
  ranked AS (
    SELECT DISTINCT ON (a.sku_id)
      a.sku_id, a.tipo, a.sev, a.desc_, a.avg_gmroi, a.avg_mdi
    FROM alertas a
    ORDER BY a.sku_id, a.sev ASC
  )
  SELECT
    r.sku_id,
    s.nombre         AS sku_nombre,
    mar.nombre       AS marca_nombre,
    r.tipo           AS tipo_alerta,
    r.sev            AS severidad,
    r.desc_          AS descripcion,
    r.avg_gmroi      AS valor_gmroi,
    r.avg_mdi        AS valor_mdi,
    s.imagen_url
  FROM ranked r
  JOIN public.skus     s   ON s.id   = r.sku_id
  LEFT JOIN public.marcas mar ON mar.id = s.marca_id
  WHERE s.activo = true
    AND (p_tipo IS NULL     OR r.tipo  = p_tipo)
    AND (p_severidad IS NULL OR r.sev  = p_severidad)
  ORDER BY r.sev ASC, r.avg_mdi DESC NULLS LAST
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_alertas_filtradas TO authenticated;

-- ============ get_tiendas_asignadas  (from 0081_mejoras_alertas_y_asignaciones.sql) ============
CREATE OR REPLACE FUNCTION public.get_tiendas_asignadas(p_planograma_id UUID)
RETURNS TABLE (
  tienda_id      UUID,
  tienda_nombre  TEXT,
  ciudad         TEXT,
  formato        TEXT,
  activa         BOOLEAN,
  fecha_desde    DATE,
  fecha_hasta    DATE
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.id          AS tienda_id,
    t.nombre      AS tienda_nombre,
    t.ciudad,
    t.formato,
    pa.activa,
    pa.fecha_desde,
    pa.fecha_hasta
  FROM public.planograma_asignaciones pa
  JOIN public.tiendas t ON t.id = pa.tienda_id
  WHERE pa.planograma_id = p_planograma_id
    AND pa.activa = TRUE
  ORDER BY t.nombre;
$$;
GRANT EXECUTE ON FUNCTION public.get_tiendas_asignadas(UUID) TO authenticated;
