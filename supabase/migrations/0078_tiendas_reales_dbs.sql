-- 0078_tiendas_reales_dbs.sql
-- Tiendas REALES de Empresas DBS extraídas de dbs.cl/nuestras-tiendas
-- 49 locales DBS Beauty Store en 15 regiones de Chile (datos oficiales)
--
-- ⚠️  Limpia ventas_fact, inventario_fact y planogramas (datos sintéticos).
--     Volver a correr: npm run seed:fake  y  npm run seed:planogramas

-- ── 1. Limpiar datos dependientes (orden FK) ─────────────────────────────────
DO $$
BEGIN
  DELETE FROM public.planograma_versiones;
  DELETE FROM public.planograma_slots;
  DELETE FROM public.planogramas;
  DELETE FROM public.inventario_fact;
  DELETE FROM public.ventas_fact;
  DELETE FROM public.tiendas;
  RAISE NOTICE '✓ Datos dependientes eliminados';
END $$;

-- ── 2. Insertar tiendas reales ────────────────────────────────────────────────
-- m2_lineales JSONB: estimaciones por categoría (metros lineales de exhibición)
-- basadas en tamaño del local según cantidad de posiciones en el nombre del local.
-- Referencia benchmark: DBS Beauty Store estándar ~80-120 m² totales de sala.

INSERT INTO public.tiendas (nombre, ciudad, region, canal, formato, m2_lineales, activa)
VALUES

-- ════════════════════════════════════════════════════
-- REGIÓN METROPOLITANA  (22 locales)
-- ════════════════════════════════════════════════════

('DBS Apumanque',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS Arauco Maipú',
 'Maipú', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":5,"Perfumes":5,"Uñas":3,"Accesorios":2}', true),

('DBS Arauco Premium Outlet Buenaventura',
 'Quilicura', 'Región Metropolitana', 'outlet', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":2}', true),

('DBS Cenco Alto Las Condes',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":10,"Skincare":7,"Cabello":5,"Perfumes":6,"Uñas":3,"Accesorios":2}', true),

('DBS Cenco El Llano',
 'San Miguel', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Cenco Florida',
 'La Florida', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Cenco La Reina',
 'La Reina', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Cenco Portal La Dehesa',
 'Lo Barnechea', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS Easton Outlet Mall',
 'Quilicura', 'Región Metropolitana', 'outlet', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":2}', true),

('DBS Mall Barrio Independencia',
 'Independencia', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Paseo Quilín',
 'Macul', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Egaña',
 'Ñuñoa', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Los Domínicos',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS MallPlaza Norte',
 'Huechuraba', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":5,"Perfumes":5,"Uñas":3,"Accesorios":2}', true),

('DBS MallPlaza Oeste',
 'Cerrillos', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Sur',
 'San Bernardo', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Tobalaba',
 'Peñalolén', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Vespucio',
 'La Florida', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":5,"Perfumes":5,"Uñas":3,"Accesorios":2}', true),

('DBS Parque Arauco',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":10,"Skincare":7,"Cabello":5,"Perfumes":7,"Uñas":3,"Accesorios":2}', true),

('DBS Providencia',
 'Providencia', 'Región Metropolitana', 'calle', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo Imperio',
 'Santiago', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo Los Trapenses',
 'Lo Barnechea', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- I REGIÓN DE TARAPACÁ  (1 local)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Iquique',
 'Iquique', 'Tarapacá', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- II REGIÓN DE ANTOFAGASTA  (4 locales)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Antofagasta',
 'Antofagasta', 'Antofagasta', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Calama',
 'Calama', 'Antofagasta', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Parque Angamos',
 'Antofagasta', 'Antofagasta', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Portal Angamos',
 'Antofagasta', 'Antofagasta', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- III REGIÓN DE ATACAMA  (1 local)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Copiapó',
 'Copiapó', 'Atacama', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- IV REGIÓN DE COQUIMBO  (2 locales)
-- ════════════════════════════════════════════════════

('DBS MallPlaza La Serena',
 'La Serena', 'Coquimbo', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo Coquimbo',
 'Coquimbo', 'Coquimbo', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- V REGIÓN DE VALPARAÍSO  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Cenco Belloto',
 'Quilpué', 'Valparaíso', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Marina Arauco',
 'Viña del Mar', 'Valparaíso', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

-- ════════════════════════════════════════════════════
-- VI REGIÓN DE O'HIGGINS  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Open Plaza Rancagua',
 'Rancagua', 'O''Higgins', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo San Fernando',
 'San Fernando', 'O''Higgins', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":6,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- VII REGIÓN DEL MAULE  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Mall Curicó',
 'Curicó', 'Maule', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Plaza Maule Talca',
 'Talca', 'Maule', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- VIII REGIÓN DEL BIOBÍO  (4 locales)
-- ════════════════════════════════════════════════════

('DBS Mall Del Centro Concepción',
 'Concepción', 'Biobío', 'calle', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Los Ángeles',
 'Los Ángeles', 'Biobío', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Mirador Bío Bío',
 'Chiguayante', 'Biobío', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Trébol',
 'Concepción', 'Biobío', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

-- ════════════════════════════════════════════════════
-- IX REGIÓN DE LA ARAUCANÍA  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Cenco Temuco',
 'Temuco', 'La Araucanía', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS Temuco Centro',
 'Temuco', 'La Araucanía', 'calle', 'DBS Beauty Store',
 '{"Maquillaje":6,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- X REGIÓN DE LOS LAGOS  (3 locales)
-- ════════════════════════════════════════════════════

('DBS Cenco Osorno',
 'Osorno', 'Los Lagos', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Paseo Chiloé',
 'Castro', 'Los Lagos', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":5,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Paseo del Mar Puerto Montt',
 'Puerto Montt', 'Los Lagos', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XII REGIÓN DE MAGALLANES  (1 local)
-- ════════════════════════════════════════════════════

('DBS Espacio Urbano Punta Arenas',
 'Punta Arenas', 'Magallanes', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XIV REGIÓN DE LOS RÍOS  (1 local)
-- ════════════════════════════════════════════════════

('DBS Mall Plaza de Los Ríos Valdivia',
 'Valdivia', 'Los Ríos', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XV REGIÓN DE ARICA Y PARINACOTA  (1 local)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Arica',
 'Arica', 'Arica y Parinacota', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XVI REGIÓN DE ÑUBLE  (1 local)
-- ════════════════════════════════════════════════════

('DBS Arauco Chillán',
 'Chillán', 'Ñuble', 'mall', 'DBS Beauty Store',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true);

-- ── 3. Verificación ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total  int;
  v_rm     int;
  v_regiones int;
BEGIN
  SELECT COUNT(*)                                          INTO v_total   FROM public.tiendas;
  SELECT COUNT(*) FILTER (WHERE region = 'Región Metropolitana')
                                                          INTO v_rm      FROM public.tiendas;
  SELECT COUNT(DISTINCT region)                           INTO v_regiones FROM public.tiendas;

  RAISE NOTICE '';
  RAISE NOTICE '✓ Tiendas DBS reales insertadas: % locales en % regiones', v_total, v_regiones;
  RAISE NOTICE '  Región Metropolitana: %', v_rm;
  RAISE NOTICE '  Regiones (resto): %', v_total - v_rm;
  RAISE NOTICE '';
  RAISE NOTICE '⚠  Próximo paso: ejecutar npm run seed:fake para regenerar ventas/inventario';
  RAISE NOTICE '   y luego npm run seed:planogramas para regenerar planogramas de ejemplo.';
END $$;
