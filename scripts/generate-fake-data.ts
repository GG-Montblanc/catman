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
    months: Number(get("months") ?? 24),
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
// Estacionalidad
// ----------------------------------------------------------------------------
function factorEstacional(mes: number /* 0-11 */, categoriaRoot: string): number {
  // Base 1.0, peaks por mes y categoría
  let f = 1.0;
  if (mes === 4 /* mayo */) f *= 1.35; // Día de la Madre
  if (mes === 1 /* feb */) f *= 1.20; // San Valentín (sobre todo labios, perfumes)
  if (mes === 11 /* dic */) f *= 1.45; // Navidad
  if (mes === 6 /* julio */ && categoriaRoot === "skincare") f *= 1.10;
  if (mes === 7 /* ago */ && categoriaRoot === "skincare") f *= 1.15;
  return f;
}

// Power-law weights: rank → weight (Pareto 80/20)
function paretoWeights(n: number): number[] {
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    w.push(1 / Math.pow(i + 1, 1.16)); // alpha ≈ 1.16 → 80/20 aprox
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
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

  // 2. Crear tiendas
  console.log("\n→ Creando tiendas...");
  // Limpiar facts y tiendas previas para idempotencia
  await supabase.from("ventas_fact").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("inventario_fact").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("tiendas").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const tiendas = generarTiendas(args.stores, rand);
  const { data: tiendasCreated, error: tErr } = await supabase
    .from("tiendas")
    .insert(tiendas)
    .select("id");
  if (tErr) throw tErr;
  console.log(`  ${tiendasCreated!.length} tiendas creadas`);

  // 3. Asignar tier de popularidad por SKU (power-law)
  const skuRanking = [...skus!].sort(() => rand() - 0.5);
  const weights = paretoWeights(skuRanking.length);
  const skuPopularidad = new Map<string, number>();
  skuRanking.forEach((s, i) => skuPopularidad.set(s.id, weights[i]));

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
    // ventas mensuales esperadas a nivel global (chain)
    const baseUnitsChain = pop * 50000; // total cadena por mes en unidades

    for (const tienda of tiendasCreated!) {
      // Tienda factor (pequeña variación por tienda)
      const tiendaFactor = 0.7 + rand() * 0.7;
      // Inventario inicial: 8-12 weeks supply
      let stockFin = Math.max(0, Math.round((baseUnitsChain / args.stores) * (8 + rand() * 4) / 4.3));

      for (let m = args.months - 1; m >= 0; m--) {
        const fecha = new Date(today);
        fecha.setMonth(fecha.getMonth() - m);
        const isoMonth = fecha.toISOString().slice(0, 10);

        const seasonal = factorEstacional(fecha.getMonth(), catRoot);
        const noise = 0.7 + rand() * 0.6;
        const expectedUnits = (baseUnitsChain / args.stores) * tiendaFactor * seasonal * noise;
        const promo = rand() < 0.15;
        const descuento_pct = promo ? 10 + Math.round(rand() * 25) : 0;

        const stockInicio = stockFin;
        // Recibido: target 10 semanas de cobertura
        const targetCobertura = expectedUnits * (10 / 4.3);
        const recibido = Math.max(0, Math.round(targetCobertura - stockInicio + expectedUnits));
        const disponible = stockInicio + recibido;

        const unidades = Math.max(0, Math.min(disponible, Math.round(expectedUnits * (promo ? 1.4 : 1.0))));
        stockFin = disponible - unidades;

        const precioBase = sku.precio_lista || 0;
        const precioVenta = precioBase * (1 - descuento_pct / 100);
        const costo = (sku.costo_unitario ?? precioBase * 0.5) * unidades;
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
        const costoInv = stockProm * (sku.costo_unitario ?? precioBase * 0.5);
        const diasStock = unidades > 0 ? (stockProm / unidades) * 30 : 365;
        const mdiMeses = unidades > 0 ? stockProm / unidades : 12;

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
