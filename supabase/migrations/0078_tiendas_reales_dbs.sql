-- 0078_tiendas_reales_dbs.sql
-- Tiendas REALES de Empresas DBS extraídas de dbs.cl/nuestras-tiendas
-- 49 locales DBS Beauty Store en 15 regiones de Chile (datos oficiales mayo 2026)
--
-- ⚠️  Limpia ventas_fact, inventario_fact y planogramas (datos sintéticos).
--     Volver a correr: npm run seed:fake  y  npm run seed:planogramas

-- ── 0. Agregar columna direccion si no existe ─────────────────────────────────
ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS direccion text;

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
-- m2_lineales JSONB: estimaciones por categoría (metros lineales de exhibición).
-- Referencia: tienda DBS estándar ~80-120 m² totales de sala.

INSERT INTO public.tiendas
  (nombre, ciudad, region, canal, formato, direccion, m2_lineales, activa)
VALUES

-- ════════════════════════════════════════════════════
-- REGIÓN METROPOLITANA  (22 locales)
-- ════════════════════════════════════════════════════

('DBS Apumanque',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Av. Manquehue Sur N°31, Local 150',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS Arauco Maipú',
 'Maipú', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda. Américo Vespucio 399, Local 502-A',
 '{"Maquillaje":9,"Skincare":6,"Cabello":5,"Perfumes":5,"Uñas":3,"Accesorios":2}', true),

('DBS Arauco Premium Outlet Buenaventura',
 'Buin', 'Región Metropolitana', 'outlet', 'DBS Beauty Store',
 'San Ignacio N°300, Local 126',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":2}', true),

('DBS Cenco Alto Las Condes',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Av. Presidente Kennedy N°9001, local 1023',
 '{"Maquillaje":10,"Skincare":7,"Cabello":5,"Perfumes":6,"Uñas":3,"Accesorios":2}', true),

('DBS Cenco El Llano',
 'San Miguel', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Av. El Llano Subercaseaux 3519A, local 1094',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Cenco Florida',
 'La Florida', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda. Vicuña Mackenna N°6100, Local 1037',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Cenco La Reina',
 'La Reina', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda. Francisco Bilbao 8750, Local 2045',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Cenco Portal La Dehesa',
 'Lo Barnechea', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avenida La Dehesa N°1445, local 1025',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS Easton Outlet Mall',
 'Quilicura', 'Región Metropolitana', 'outlet', 'DBS Beauty Store',
 'Pte. Eduardo Frei Montalva N°9709-9719, Local L515-A',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":2}', true),

('DBS Mall Barrio Independencia',
 'Independencia', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Av. Independencia N°565, Local 148',
 '{"Maquillaje":7,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Paseo Quilín',
 'Macul', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Calle Mar Tirreno 3349, Local 1037',
 '{"Maquillaje":7,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Egaña',
 'Ñuñoa', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avenida Larraín 5862, local 1061-1065',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Los Domínicos',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avenida Padre Hurtado Sur 785, locales C-2121-C-2125',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS MallPlaza Norte',
 'Huechuraba', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Av. Américo Vespucio 1737, local 1177-1181-1185b-1185c-1189b-1189c',
 '{"Maquillaje":9,"Skincare":6,"Cabello":5,"Perfumes":5,"Uñas":3,"Accesorios":2}', true),

('DBS MallPlaza Oeste',
 'Cerrillos', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda Americo Vespucio 1501, local BA 145-BA 149',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Sur',
 'San Bernardo', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda Presidente Jorge Allessandri Nº20040, local B-1029-1031-1033',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Tobalaba',
 'Peñalolén', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Av. Camilo Henríquez N°3692, local c125-129-133',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Vespucio',
 'La Florida', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda Vicuña Mackenna Oriente 7110 local 126-127-128, 1º nivel',
 '{"Maquillaje":9,"Skincare":6,"Cabello":5,"Perfumes":5,"Uñas":3,"Accesorios":2}', true),

('DBS Parque Arauco',
 'Las Condes', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda Kennedy 5413 local 122C, 1º nivel',
 '{"Maquillaje":10,"Skincare":7,"Cabello":5,"Perfumes":7,"Uñas":3,"Accesorios":2}', true),

('DBS Providencia',
 'Providencia', 'Región Metropolitana', 'calle', 'DBS Beauty Store',
 'Avda. Providencia 2230, Local 15',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo Imperio',
 'Santiago', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'San Antonio 236, local 219',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo Los Trapenses',
 'Lo Barnechea', 'Región Metropolitana', 'mall', 'DBS Beauty Store',
 'Avda. José Alcalde Délano 10533, Local 108, nivel -2',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- I REGIÓN DE TARAPACÁ  (1 local)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Iquique',
 'Iquique', 'Tarapacá', 'mall', 'DBS Beauty Store',
 'Avenida Héroes de la Concepción Nº2555, local 010-011-193',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- II REGIÓN DE ANTOFAGASTA  (4 locales)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Antofagasta',
 'Antofagasta', 'Antofagasta', 'mall', 'DBS Beauty Store',
 'Avda Balmaceda N°2355, local 188-190-192-194',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Calama',
 'Calama', 'Antofagasta', 'mall', 'DBS Beauty Store',
 'Avda. Balmaceda 3242, Local A-139',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Parque Angamos',
 'Antofagasta', 'Antofagasta', 'mall', 'DBS Beauty Store',
 'Av. Angamos, Lote A 1, #02170, Local 106',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Portal Angamos',
 'Antofagasta', 'Antofagasta', 'mall', 'DBS Beauty Store',
 'Angamos 745 Local 1021',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- III REGIÓN DE ATACAMA  (1 local)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Copiapó',
 'Copiapó', 'Atacama', 'mall', 'DBS Beauty Store',
 'Maipú N°0110, Local A-1172/A-1176',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- IV REGIÓN DE COQUIMBO  (2 locales)
-- ════════════════════════════════════════════════════

('DBS MallPlaza La Serena',
 'La Serena', 'Coquimbo', 'mall', 'DBS Beauty Store',
 'Avda Alberto Solari 1400, local BE117-121-125',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo Coquimbo',
 'Coquimbo', 'Coquimbo', 'mall', 'DBS Beauty Store',
 'Baquedano 86, Local 1144',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- V REGIÓN DE VALPARAÍSO  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Cenco Belloto',
 'Quilpué', 'Valparaíso', 'mall', 'DBS Beauty Store',
 'Av. Ramón Freire N°2414 local 1108',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Marina Arauco',
 'Viña del Mar', 'Valparaíso', 'mall', 'DBS Beauty Store',
 'Av. Libertad 1348, Local 30 Block B',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

-- ════════════════════════════════════════════════════
-- VI REGIÓN DE O'HIGGINS  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Open Plaza Rancagua',
 'Rancagua', 'O''Higgins', 'mall', 'DBS Beauty Store',
 'Teniente Coronel Jose Bernardo Cuevas N°405, local 2110',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Vivo San Fernando',
 'San Fernando', 'O''Higgins', 'mall', 'DBS Beauty Store',
 'Bernardo O''Higgins 701, Local 2184',
 '{"Maquillaje":6,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- VII REGIÓN DEL MAULE  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Mall Curicó',
 'Curicó', 'Maule', 'mall', 'DBS Beauty Store',
 'Bernardo O''Higgins N°201, Local 51, nivel 1',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Plaza Maule Talca',
 'Talca', 'Maule', 'mall', 'DBS Beauty Store',
 'Avenida Circunvalación Oriente 1055, Local 149-150',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- VIII REGIÓN DEL BIOBÍO  (4 locales)
-- ════════════════════════════════════════════════════

('DBS Mall Del Centro Concepción',
 'Concepción', 'Biobío', 'calle', 'DBS Beauty Store',
 'Barros Arana N°1068, Local 48',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Los Ángeles',
 'Los Ángeles', 'Biobío', 'mall', 'DBS Beauty Store',
 'Valdivia 440, Local 126',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Mirador Bío Bío',
 'Chiguayante', 'Biobío', 'mall', 'DBS Beauty Store',
 'Los Carrera Poniente 301, Local BE103 y BE105',
 '{"Maquillaje":8,"Skincare":5,"Cabello":4,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS MallPlaza Trébol',
 'Concepción', 'Biobío', 'mall', 'DBS Beauty Store',
 'Avda Jorge Alessandri 3177, local A227-A229-A231',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

-- ════════════════════════════════════════════════════
-- IX REGIÓN DE LA ARAUCANÍA  (2 locales)
-- ════════════════════════════════════════════════════

('DBS Cenco Temuco',
 'Temuco', 'La Araucanía', 'mall', 'DBS Beauty Store',
 'Alemania 671, Local 1046',
 '{"Maquillaje":9,"Skincare":6,"Cabello":4,"Perfumes":5,"Uñas":2,"Accesorios":2}', true),

('DBS Temuco Centro',
 'Temuco', 'La Araucanía', 'calle', 'DBS Beauty Store',
 'Manuel Bulnes 510',
 '{"Maquillaje":6,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- X REGIÓN DE LOS LAGOS  (3 locales)
-- ════════════════════════════════════════════════════

('DBS Cenco Osorno',
 'Osorno', 'Los Lagos', 'mall', 'DBS Beauty Store',
 'Plaza Yungay 609, Local N° 1021',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Paseo Chiloé',
 'Castro', 'Los Lagos', 'mall', 'DBS Beauty Store',
 'Calle Ignacio Serrano 574, Local 106',
 '{"Maquillaje":5,"Skincare":4,"Cabello":3,"Perfumes":3,"Uñas":2,"Accesorios":1}', true),

('DBS Mall Paseo del Mar Puerto Montt',
 'Puerto Montt', 'Los Lagos', 'mall', 'DBS Beauty Store',
 'Illapel 10, local EP 09B',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XII REGIÓN DE MAGALLANES  (1 local)
-- ════════════════════════════════════════════════════

('DBS Espacio Urbano Punta Arenas',
 'Punta Arenas', 'Magallanes', 'mall', 'DBS Beauty Store',
 'Av. Eduardo Frei Montalva N°01110, Local 140',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XIV REGIÓN DE LOS RÍOS  (1 local)
-- ════════════════════════════════════════════════════

('DBS Mall Plaza de Los Ríos Valdivia',
 'Valdivia', 'Los Ríos', 'mall', 'DBS Beauty Store',
 'Arauco 561, Local 238, Nivel 2',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XV REGIÓN DE ARICA Y PARINACOTA  (1 local)
-- ════════════════════════════════════════════════════

('DBS MallPlaza Arica',
 'Arica', 'Arica y Parinacota', 'mall', 'DBS Beauty Store',
 'Avda. Diego Portales N°640, local A-1041',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true),

-- ════════════════════════════════════════════════════
-- XVI REGIÓN DE ÑUBLE  (1 local)
-- ════════════════════════════════════════════════════

('DBS Arauco Chillán',
 'Chillán', 'Ñuble', 'mall', 'DBS Beauty Store',
 'Isabel Riquelme N°709, Local 351',
 '{"Maquillaje":7,"Skincare":5,"Cabello":3,"Perfumes":4,"Uñas":2,"Accesorios":1}', true);

-- ── 3. Verificación ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total    int;
  v_rm       int;
  v_regiones int;
  v_sin_dir  int;
BEGIN
  SELECT COUNT(*)                                           INTO v_total    FROM public.tiendas;
  SELECT COUNT(*) FILTER (WHERE region = 'Región Metropolitana')
                                                           INTO v_rm       FROM public.tiendas;
  SELECT COUNT(DISTINCT region)                            INTO v_regiones FROM public.tiendas;
  SELECT COUNT(*) FILTER (WHERE direccion IS NULL)         INTO v_sin_dir  FROM public.tiendas;

  RAISE NOTICE '';
  RAISE NOTICE '✓ Tiendas DBS reales: % locales en % regiones', v_total, v_regiones;
  RAISE NOTICE '  Región Metropolitana : %', v_rm;
  RAISE NOTICE '  Resto de regiones    : %', v_total - v_rm;
  RAISE NOTICE '  Sin dirección        : %', v_sin_dir;
  RAISE NOTICE '';
  RAISE NOTICE '⚠  Próximo paso: npm run seed:fake  →  npm run seed:planogramas';
END $$;
