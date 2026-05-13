/**
 * scripts/load-catalog.ts
 *
 * Carga scrape-output/dbs-catalog.json a Supabase:
 *   1. Crea jerarquía de categorías (familia > subfamilia)
 *   2. Crea marcas únicas
 *   3. Inserta SKUs con FKs resueltas
 *
 * Usa SERVICE_ROLE para bypassear RLS.
 *
 * Uso:
 *   npm run load:catalog
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type RawProduct = {
  sku_externo: string;
  nombre: string;
  marca: string | null;
  precio_lista: number;
  precio_oferta: number | null;
  imagen_url: string | null;
  url_dbs: string;
  categoria_path: string;
  atributos: Record<string, string>;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("Cargando scrape-output/dbs-catalog.json...");
  const data = JSON.parse(
    await fs.readFile("scrape-output/dbs-catalog.json", "utf-8")
  ) as { productos: RawProduct[]; categorias: string[] };

  // -------------------------------------------------------------------
  // 1) Categorías jerárquicas
  // -------------------------------------------------------------------
  console.log("\n→ Categorías");
  const allPaths = new Set<string>();
  for (const cat of data.categorias) allPaths.add(cat);
  for (const p of data.productos) allPaths.add(p.categoria_path);

  // Generar jerarquía: para "maquillaje/labios", insertar tanto "maquillaje"
  // como "maquillaje/labios"
  const expanded = new Set<string>();
  for (const p of allPaths) {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      expanded.add(parts.slice(0, i).join("/"));
    }
  }

  const sorted = [...expanded].sort((a, b) => a.split("/").length - b.split("/").length);
  const catIdByRuta = new Map<string, string>();

  for (const ruta of sorted) {
    const parts = ruta.split("/");
    const nombre = parts[parts.length - 1].replace(/-/g, " ");
    const slug = parts[parts.length - 1];
    const nivel = parts.length;
    const parentRuta = parts.slice(0, -1).join("/");
    const parent_id = parentRuta ? catIdByRuta.get(parentRuta) ?? null : null;

    const { data: row, error } = await supabase
      .from("categorias")
      .upsert(
        {
          nombre,
          slug,
          parent_id,
          nivel,
          ruta,
        },
        { onConflict: "ruta" }
      )
      .select("id")
      .single();

    if (error) {
      console.error(`  ❌ ${ruta}: ${error.message}`);
      continue;
    }
    catIdByRuta.set(ruta, row.id);
  }
  console.log(`  ${catIdByRuta.size} categorías upserted`);

  // -------------------------------------------------------------------
  // 2) Marcas
  // -------------------------------------------------------------------
  console.log("\n→ Marcas");
  const brandNames = new Set<string>();
  for (const p of data.productos) {
    if (p.marca) brandNames.add(p.marca.trim());
  }

  const brandIdByNombre = new Map<string, string>();
  for (const nombre of brandNames) {
    const slug = slugify(nombre);
    const { data: row, error } = await supabase
      .from("marcas")
      .upsert({ nombre, slug, propia: false }, { onConflict: "slug" })
      .select("id")
      .single();
    if (error) {
      console.error(`  ❌ ${nombre}: ${error.message}`);
      continue;
    }
    brandIdByNombre.set(nombre, row.id);
  }
  console.log(`  ${brandIdByNombre.size} marcas upserted`);

  // -------------------------------------------------------------------
  // 3) SKUs (en chunks)
  // -------------------------------------------------------------------
  console.log("\n→ SKUs");
  const rows = data.productos.map((p) => ({
    sku_externo: p.sku_externo,
    nombre: p.nombre,
    marca_id: p.marca ? brandIdByNombre.get(p.marca.trim()) ?? null : null,
    categoria_id: catIdByRuta.get(p.categoria_path) ?? null,
    precio_lista: p.precio_lista,
    precio_oferta: p.precio_oferta,
    // Costo = 50% del precio de lista (placeholder); solo si precio > 0
    costo_unitario: (p.precio_lista && p.precio_lista > 0) ? p.precio_lista * 0.5 : null,
    imagen_url: p.imagen_url,
    url_dbs: p.url_dbs,
    atributos: p.atributos,
    importado: true,
    lead_time_dias: 150,
    activo: true,
  }));

  let upserted = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from("skus")
      .upsert(batch, { onConflict: "sku_externo" });
    if (error) {
      console.error(`  ❌ batch falló: ${error.message}`);
    } else {
      upserted += batch.length;
      process.stdout.write(`\r  ${upserted}/${rows.length} SKUs upserted`);
    }
  }
  console.log(`\n  ✓ ${upserted} SKUs cargados`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
