-- 0092_fix_ventana_pedido_planograma.sql
-- get_planograma_pedido usaba "CURRENT_DATE - 2 meses" como ventana de datos
-- recientes. Como el dataset sintetico tiene fecha de corte fija (max
-- anio_mes en mv_sku_kpis_mensual), esa ventana se va quedando fuera de
-- rango a medida que pasa el tiempo real (ya lo estaba: hoy - 2 meses caia
-- despues del ultimo mes con datos, asi que la funcion nunca encontraba
-- filas). Se cambia a una ventana relativa al ultimo mes real de datos.

CREATE OR REPLACE FUNCTION public.get_planograma_pedido(p_planograma_id UUID)
RETURNS TABLE (
  sku_id          UUID,
  sku_nombre      TEXT,
  marca_nombre    TEXT,
  imagen_url      TEXT,
  precio_lista    NUMERIC,
  frentes_total   BIGINT,
  stock_actual    NUMERIC,
  venta_mensual   NUMERIC,
  semanas_target  INT,
  unidades_target NUMERIC,
  unidades_pedir  NUMERIC,
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
  ultimo_mes AS (
    SELECT MAX(anio_mes) AS mes FROM public.mv_sku_kpis_mensual
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
    WHERE k.anio_mes >= (SELECT mes FROM ultimo_mes) - INTERVAL '2 months'
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
