-- 0082_fix_costo_unitario.sql
-- Parcha SKUs donde costo_unitario = 0 (bug en load-catalog.ts con precio_lista = 0).
-- El costo se recalcula como 50% del precio_lista (si disponible) o precio_oferta.
-- Ejecutar en Supabase SQL Editor.

-- 1. Parchear SKUs con costo_unitario = 0 (no null) donde hay precio disponible
UPDATE public.skus
SET costo_unitario = COALESCE(precio_lista, precio_oferta, 5000) * 0.5
WHERE (costo_unitario IS NULL OR costo_unitario = 0)
  AND COALESCE(precio_lista, precio_oferta, 0) > 0;

-- 2. Para SKUs sin precio conocido, asignar un costo_unitario mínimo razonable
-- (se sobreescribirá cuando corra seed:fake con precios reales)
UPDATE public.skus
SET costo_unitario = 3500  -- CLP ~$3.500 = costo mínimo beauty
WHERE (costo_unitario IS NULL OR costo_unitario = 0)
  AND activo = true;

-- 3. Verificar resultado
SELECT
  COUNT(*)                                 AS total_skus,
  COUNT(*) FILTER (WHERE costo_unitario > 0) AS con_costo_positivo,
  COUNT(*) FILTER (WHERE costo_unitario = 0 OR costo_unitario IS NULL) AS sin_costo,
  ROUND(AVG(costo_unitario), 0)            AS costo_promedio
FROM public.skus
WHERE activo = true;
