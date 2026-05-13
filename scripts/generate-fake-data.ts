/**
 * scripts/generate-fake-data.ts
 *
 * Genera dataset sintético creíble sobre el catálogo real:
 *   - 50 tiendas DBS con formato/canal/región
 *   - N meses de ventas e inventario por SKU × tienda
 *   - Distribución power-law (20% top vende 80%)
 *   - Estacionalidad: peaks Día de la Madre (mayo), San Valentín (feb), Navidad (dic)
 *   - Costos 40-60% del precio_lista, márgenes realistas
 *
 * Uso:
 *   npm run seed:fake -- --months 24 --stores 50
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type Args = {
  months: number;
  stores: number;
  seed: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    months: Number(get("months") ?? 12),   // 12 meses por defecto (cabe en plan Free)
    stores: Number(get("stores") ?? 50),
    seed: Number(get("seed") ?? 42),
  };
}

// PRNG determinístico (mulberry32) para resultados reproducibles
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// Tiendas
// ----------------------------------------------------------------------------
const REGIONES = [
  { region: "Metropolitana", ciudades: ["Santiago", "Las Condes", "Providencia", "Maipú", "Puente Alto", "La Florida", "Ñuñoa", "Vitacura"], peso: 12 },
  { region: "Valparaíso", ciudades: ["Valparaíso", "Viña del Mar", "Quilpué"], peso: 3 },
  { region: "Biobío", ciudades: ["Concepción", "Talcahuano", "Los Ángeles"], peso: 3 },
  { region: "La Araucanía", ciudades: ["Temuco"], peso: 2 },
  { region: "Coquimbo", ciudades: ["La Serena", "Coquimbo"], peso: 2 },
  { region: "Antofagasta", ciudades: ["Antofagasta", "Calama"], peso: 2 },
  { region: "O'Higgins", ciudades: ["Rancagua"], peso: 1 },
  { region: "Maule", ciudades: ["Talca", "Curicó"], peso: 1 },
  { region: "Los Lagos", ciudades: ["Puerto Montt", "Osorno"], peso: 1 },
  { region: "Tarapacá", ciudades: ["Iquique"], peso: 1 },
];

const CANALES = ["mall", "calle", "outlet"] as const;
const FORMATOS = ["DBS Beauty Store", "Tiendas MakeUp", "Prismology"] as const;

function generarTiendas(n: number, rand: () => number) {
  const tiendas: {
    nombre: string;
    ciudad: string;
    region: string;
    canal: string;
    formato: string;
    m2_lineales: Record<string, number>;
  }[] = [];
  // Pool ponderado de ciudades por peso de región
  const pool: { region: string; ciudad: string }[] = [];
  for (const r of REGIONES) {
    for (const c of r.ciudades) {
      for (let i = 0; i < r.peso; i++) pool.push({ region: r.region, ciudad: c });
    }
  }

  const usados = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const pick = pool[Math.floor(rand() * pool.length)];
    const canal = CANALES[Math.floor(rand() * CANALES.length)];
    const formato = FORMATOS[Math.floor(rand() * FORMATOS.length)];
    const key = `${pick.ciudad}-${formato}`;
    const idx = (usados.get(key) ?? 0) + 1;
    usados.set(key, idx);
    const sufijo = canal === "mall" ? "Mall" : canal === "outlet" ? "Outlet" : "Centro";
    tiendas.push({
      nombre: `${formato} ${pick.ciudad} ${sufijo} ${idx > 1 ? idx : ""}`.trim(),
      ciudad: pick.ciudad,
      region: pick.region,
      canal,
      formato,
      m2_lineales: {
        maquillaje: 6 + Math.round(rand() * 6),
        skincare: 4 + Math.round(rand() * 4),
        capilar: 2 + Math.round(rand() * 3),
        corporal: 2 + Math.round(rand() * 3),
        perfumes: 3 + Math.round(rand() * 4),
      },
    });
  }
  return tiendas;
}

// ----------------------------------------------------------------------------
// Benchmarks reales beauty retail Chile (investigación mercado 2024-2025)
// Fuentes: NIQ State of Beauty 2025, Kantar Chile, Ulta/Sephora financials,
//          ICEX Sector Cosmética Chile, Mordor Intelligence
// ----------------------------------------------------------------------------

// Margen bruto por categoría (% sobre precio venta)
const MARGEN_POR_CATEGORIA: Record<string, { min: number; max: number }> = {
  maquillaje: { min: 0.55, max: 0.70 }, // 55–70% — color cosmetics, alta rotación
  skincare:   { min: 0.50, max: 0.60 }, // 50–60% — importado premium
  perfumes:   { min: 0.50, max: 0.65 }, // 50–65% — marcas premium
  capilar:    { min: 0.45, max: 0.55 }, // 45–55% — capilar premium importado
  corporal:   { min: 0.45, max: 0.60 }, // 45–60% — según marca
};

// Inventario target en semanas (basado en lead time + benchmarks)
// Importados (EE.UU./Europa→Chile marítimo): 30-50 días + buffer → 10-14 semanas
// MDI saludable: 2.0–2.5 meses → ~9-11 semanas
const SEMANAS_INV_TARGET: Record<string, number> = {
  maquillaje: 9,   // rotación 5-6x/año → ~2 meses ideal
  skincare:   11,  // rotación 3.5-4.5x/año → ~2.5 meses
  perfumes:   13,  // rotación 3-4x/año → ~3 meses (más lento)
  capilar:    10,  // rotación 4-5x/año → ~2.4 meses
  corporal:   11,  // similar a skincare
};

// Rotación anual por categoría (inventory turnover)
// GMROI target = margen × turnover → maquillaje: 0.625 × 5.5 = 3.4–4.3
const TURNOVER_ANUAL: Record<string, number> = {
  maquillaje: 5.5, // 5–6x/año (benchmark Ulta ~5.5)
  skincare:   4.0, // 3.5–4.5x/año
  perfumes:   3.5, // 3–4x/año
  capilar:    4.5, // 4–5x/año
  corporal:   4.0, // 3.5–4.5x/año
};

// ----------------------------------------------------------------------------
// Estacionalidad Chile (benchmarks reales)
// Q4 Oct-Dic: +30-50%, Q1 Ene-Mar: -15-25%, Q2 Abr-Jun: +10-20%
// ----------------------------------------------------------------------------
function factorEstacional(mes: number /* 0-11 */, categoriaRoot: string): number {
  let f = 1.0;

  // Navidad/Año Nuevo (diciembre): peak principal +40% — todas las categorías
  if (mes === 11) f *= 1.42;

  // Pre-navidad (noviembre): anticipación compras +20%
  if (mes === 10) f *= 1.20;

  // Octubre: inicio temporada alta +10%
  if (mes === 9) f *= 1.10;

  // Día de la Madre (mayo): segundo peak Chile +30%
  if (mes === 4) f *= 1.32;

  // San Valentín (febrero): labios y perfumes principalmente
  if (mes === 1) {
    f *= 1.18;
    if (categoriaRoot === "perfumes") f *= 1.10; // extra boost perfumes
    if (categoriaRoot === "maquillaje") f *= 1.08;
  }

  // Invierno (junio-agosto): skincare sube, otras bajan levemente
  if (mes === 5 || mes === 6 || mes === 7) {
    if (categoriaRoot === "skincare") f *= 1.15;
    else if (categoriaRoot === "corporal") f *= 1.10;
    else f *= 0.92; // otras categorías caen levemente en invierno
  }

  // Verano (enero-marzo): post-holidays, presupuesto bajo → -15-25%
  if (mes === 0) f *= 0.82; // enero: post-navidad, muy bajo
  if (mes === 2) f *= 0.88; // marzo: fin verano

  // Primavera (septiembre): recuperación +10%
  if (mes === 8) f *= 1.08;

  return f;
}

// Power-law weights: beauty más concentrado que 80/20
// Benchmark real: 20% SKUs → 70-80% ventas (alpha ~1.2)
function paretoWeights(n: number): number[] {
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    w.push(1 / Math.pow(i + 1, 1.22)); // alpha 1.22 → 75/20 aprox (más concentrado)
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

// Retorna margen bruto unitario según categoría (fracción del precio venta)
function margenPorCategoria(catRoot: string, rand: () => number): number {
  const rango = MARGEN_POR_CATEGORIA[catRoot] ?? { min: 0.48, max: 0.58 };
  return rango.min + rand() * (rango.max - rango.min);
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertWithRetry(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 500,
  maxRetries = 3,
): Promise<number> {
  let inserted = 0;
  for (const batch of chunk(rows, batchSize)) {
    let attempt = 0;
    while (attempt < maxRetries) {
      const { error } = await supabase.from(table).insert(batch);
      if (!error) { inserted += batch.length; break; }
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`  ✗ ${table} batch failed after ${maxRetries} retries: ${error.message}`);
      } else {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return inserted;
}

async function main() {
  const args = parseArgs();
  const rand = rng(args.seed);
  console.log(`Generando datos sintéticos: ${args.months} meses × ${args.stores} tiendas`);

  // 1. Cargar SKUs
  console.log("\n→ Cargando SKUs...");
  const { data: skus, error: skuErr } = await supabase
    .from("skus")
    .select("id, precio_lista, costo_unitario, categoria_id, categorias:categoria_id(ruta)")
    .eq("activo", true)
    .limit(20000);
  if (skuErr) throw skuErr;
  console.log(`  ${skus!.length} SKUs cargados`);

  // 2. Tiendas — usar las reales si ya existen (migración 0078), sino generar sintéticas
  console.log("\n→ Verificando tiendas...");
  const { data: tiendasExistentes, error: tCheckErr } = await supabase
    .from("tiendas")
    .select("id")
    .limit(1);
  if (tCheckErr) throw tCheckErr;

  let tiendasCreated: { id: string }[];

  if (tiendasExistentes && tiendasExistentes.length > 0) {
    // Tiendas reales ya cargadas por migración 0078 — solo limpiar facts
    console.log("  Tiendas reales detectadas. Limpiando ventas/inventario previos...");
    await supabase.from("ventas_fact").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("inventario_fact").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { data: all, error: allErr } = await supabase.from("tiendas").select("id");
    if (allErr) throw allErr;
    tiendasCreated = all!;
    console.log(`  ${tiendasCreated.length} tiendas reales en uso`);
  } else {
    // Sin tiendas reales: generar sintéticas (modo legacy / sin migración 0078)
    console.log("  Sin tiendas en DB. Generando tiendas sintéticas...");
    await supabase.from("ventas_fact").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("inventario_fact").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const tiendas = generarTiendas(args.stores, rand);
    const { data: created, error: tErr } = await supabase
      .from("tiendas")
      .insert(tiendas)
      .select("id");
    if (tErr) throw tErr;
    tiendasCreated = created!;
    console.log(`  ${tiendasCreated.length} tiendas sintéticas creadas`);
  }

  // 3. Asignar tier de popularidad por SKU (power-law)
  const skuRanking = [...skus!].sort(() => rand() - 0.5);
  const weights = paretoWeights(skuRanking.length);
  const skuPopularidad = new Map<string, number>();
  const skuStoreReach = new Map<string, number>(); // fracción de tiendas que llevan este SKU
  skuRanking.forEach((s, i) => {
    skuPopularidad.set(s.id, weights[i]);
    // Top 20% SKUs → 90% tiendas | Mid 30% → 65% | Bottom 50% → 40%
    const pct = i / skuRanking.length;
    const reach = pct < 0.20 ? 0.90 : pct < 0.50 ? 0.65 : 0.40;
    skuStoreReach.set(s.id, reach);
  });

  // 4. Generar series mensuales
  console.log("\n→ Generando ventas e inventario...");
  const today = new Date();
  today.setDate(1);
  today.setHours(0, 0, 0, 0);

  const ventasBuffer: Record<string, unknown>[] = [];
  const invBuffer: Record<string, unknown>[] = [];

  let totalVentas = 0;
  let totalInv = 0;

  for (const sku of skus!) {
    const pop = skuPopularidad.get(sku.id)!;
    const cat = (sku.categorias as { ruta?: string } | null)?.ruta ?? "";
    const catRoot = cat.split("/")[0];
    // Ventas mensuales esperadas basadas en rotación real por categoría
    // turnover anual × precio promedio → ingreso anual → unidades/mes/tienda
    // Ej: maquillaje 5.5x, precio ~$8.000 CLP → ~3.5 unidades/mes por SKU top
    const turnover = TURNOVER_ANUAL[catRoot] ?? 4.0;
    // baseUnitsChain: unidades totales de la cadena por mes para este SKU
    // SKU top (pop=max) vende ~turnover/12 * (precio/costo) unidades/tienda
    // Escalamos por popularidad (power-law ya aplicado en pop)
    // Usamos raíz quinta del peso para aplanar la power-law:
    // así incluso SKUs bottom tienen ventas ocasionales (~0.2 uds/tienda/mes)
    const baseUnitsChain = Math.pow(pop, 0.2) * args.stores * turnover * 0.5;

    for (const tienda of tiendasCreated!) {
      // Cobertura: no todos los SKUs están en todas las tiendas
      const reach = skuStoreReach.get(sku.id) ?? 0.5;
      if (rand() > reach) continue; // este SKU no se vende en esta tienda

      // Tienda factor (pequeña variación por tienda)
      const tiendaFactor = 0.7 + rand() * 0.7;
      // Inventario inicial: 8-12 weeks supply
      let stockFin = Math.max(0, Math.round((baseUnitsChain / args.stores) * (8 + rand() * 4) / 4.3));

      for (let m = args.months - 1; m >= 0; m--) {
        const fecha = new Date(today);
        fecha.setMonth(fecha.getMonth() - m);
        const isoMonth = fecha.toISOString().slice(0, 10);

        const seasonal = factorEstacional(fecha.getMonth(), catRoot);
        // Ruido realista: ±30% (beauty tiene varianza moderada-alta)
        const noise = 0.70 + rand() * 0.60;
        const expectedUnits = (baseUnitsChain / args.stores) * tiendaFactor * seasonal * noise;

        // Promociones: 15% de frecuencia, descuento 10–35% (beauty standard)
        const promo = rand() < 0.15;
        const descuento_pct = promo ? 10 + Math.round(rand() * 25) : 0;
        // Boost de ventas en promo: +35-45% (beauty promo lift benchmark)
        const promoLift = promo ? 1.35 + rand() * 0.10 : 1.0;

        const stockInicio = stockFin;
        // Target de cobertura por categoría (benchmarks reales)
        const semanasTarget = SEMANAS_INV_TARGET[catRoot] ?? 10;
        const targetCobertura = expectedUnits * (semanasTarget / 4.3);
        const recibido = Math.max(0, Math.round(targetCobertura - stockInicio + expectedUnits));
        const disponible = stockInicio + recibido;

        const unidades = Math.max(0, Math.min(disponible, Math.round(expectedUnits * promoLift)));
        stockFin = disponible - unidades;

        // Saltar filas sin actividad para reducir volumen
        if (unidades === 0 && recibido === 0) continue;

        // Precio base: usar precio_lista si es > 0, sino precio_oferta, sino default 5000
        const precioBase = (sku.precio_lista && sku.precio_lista > 0)
          ? sku.precio_lista
          : 5000 + Math.round(rand() * 45000)  // ~5K-50K CLP (rango beauty realista)
        const precioVenta = precioBase * (1 - descuento_pct / 100);

        // Costo basado en margen real de la categoría (no fijo 50%)
        const margenFrac = margenPorCategoria(catRoot, rand);
        // Usar costo_unitario de la DB solo si es positivo (evita bug con scraper que pone 0)
        const costoUnitario = (sku.costo_unitario && sku.costo_unitario > 0)
          ? sku.costo_unitario
          : precioBase * (1 - margenFrac);
        const costo = costoUnitario * unidades;
        const ingreso = precioVenta * unidades;

        ventasBuffer.push({
          sku_id: sku.id,
          tienda_id: tienda.id,
          anio_mes: isoMonth,
          unidades,
          unidades_recibidas: recibido,
          ingreso: Math.round(ingreso),
          costo: Math.round(costo),
          promo,
          descuento_pct,
        });

        const stockProm = (stockInicio + stockFin) / 2;
        const costoInv = stockProm * costoUnitario;
        // MDI saludable beauty: 1.5–3 meses. Cap en 12 para obsoletos.
        const diasStock = unidades > 0 ? Math.min(365, (stockProm / unidades) * 30) : 180;
        const mdiMeses = unidades > 0 ? Math.min(12, stockProm / unidades) : 6;

        invBuffer.push({
          sku_id: sku.id,
          tienda_id: tienda.id,
          anio_mes: isoMonth,
          stock_inicio: stockInicio,
          stock_fin: stockFin,
          stock_promedio: Math.round(stockProm * 100) / 100,
          costo_inventario: Math.round(costoInv),
          dias_stock: Math.min(365, Math.round(diasStock * 100) / 100),
          mdi_meses: Math.min(36, Math.round(mdiMeses * 100) / 100),
        });
      }

      // Flush periódico para no usar demasiada RAM
      if (ventasBuffer.length >= 2000) {
        totalVentas += await insertWithRetry("ventas_fact", ventasBuffer);
        ventasBuffer.length = 0;
        process.stdout.write(`\r  ventas: ${totalVentas.toLocaleString()} filas`);
      }
      if (invBuffer.length >= 2000) {
        totalInv += await insertWithRetry("inventario_fact", invBuffer);
        invBuffer.length = 0;
      }
    }
  }

  // Flush final
  if (ventasBuffer.length > 0) {
    totalVentas += await insertWithRetry("ventas_fact", ventasBuffer);
  }
  if (invBuffer.length > 0) {
    totalInv += await insertWithRetry("inventario_fact", invBuffer);
  }

  console.log(`\n\n✓ Ventas: ${totalVentas.toLocaleString()} filas`);
  console.log(`✓ Inventario: ${totalInv.toLocaleString()} filas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
