/**
 * scripts/scrape-dbs.ts
 *
 * Scraper del catálogo público de https://dbs.cl (Magento).
 * 1. Recorre categorías top-level y descubre subcategorías.
 * 2. Paginates productos por subcategoría leaf.
 * 3. Extrae sku, nombre, marca, precio, imagen, url.
 * 4. Output: scrape-output/dbs-catalog.json
 *
 * Uso:
 *   npm run scrape:dbs
 *   npm run scrape:dbs -- --max-pages 2 --only maquillaje
 *
 * Respeta robots.txt: User-Agent identificado, rate limit 1 req/seg.
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://dbs.cl";
const UA =
  process.env.SCRAPER_USER_AGENT ??
  "DBS-Category-Tracker/0.1 (contacto@montblanc.cl)";
const RATE_LIMIT_MS = Number(process.env.SCRAPER_RATE_LIMIT_MS ?? 1000);

const TOP_CATEGORIES = [
  "maquillaje",
  "skincare",
  "corporal",
  "capilar",
  "perfumes",
];

type Args = {
  maxPages: number;
  only: string | null;
  outDir: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  return {
    maxPages: Number(get("max-pages") ?? 0) || Infinity,
    only: get("only"),
    outDir: get("out") ?? "scrape-output",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "es-CL,es;q=0.9" },
      });
      if (res.status === 404) throw new Error(`404 ${url}`);
      if (res.status === 429) {
        console.warn(`  429 throttle, sleeping ${5000 * (i + 1)}ms`);
        await sleep(5000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

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

function priceToNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  // "$15.990" → 15990 ; "246.000 X 100 ML" → 246000
  const clean = s.replace(/[^\d]/g, "");
  if (!clean) return null;
  return Number(clean);
}

function extractProductsFromCategory(
  html: string,
  categoriaPath: string
): RawProduct[] {
  const $ = cheerio.load(html);
  const products: RawProduct[] = [];

  // Magento product cards — selectores defensivos (multiple posibles)
  const cardSelectors = [
    ".product-item-info",
    ".product-item",
    ".item.product",
    "[data-product-id]",
  ];
  let cards = $();
  for (const sel of cardSelectors) {
    cards = $(sel);
    if (cards.length > 0) break;
  }
  if (cards.length === 0) {
    // Fallback: cualquier link que termine con un slug largo
    cards = $("li a[href]").filter((_, el) => {
      const href = $(el).attr("href") || "";
      return /^https?:\/\/dbs\.cl\/[a-z0-9-]{15,}$/.test(href);
    });
  }

  cards.each((_, el) => {
    const $card = $(el);

    const linkEl =
      $card.find("a.product-item-link, a.product-item-photo, a[href]").first();
    const href = linkEl.attr("href") || "";
    if (!href || !href.startsWith("http")) return;

    const url = href.startsWith("//") ? "https:" + href : href;
    const slug = new URL(url).pathname.replace(/^\//, "");
    if (!slug || slug.includes("/")) return; // productos de DBS son slug directo

    const nombre =
      $card.find(".product-item-name, .product-name").first().text().trim() ||
      linkEl.attr("title") ||
      linkEl.find("img").attr("alt") ||
      "";

    const marca =
      $card.find(".product-brand, .brand, .product-item-brand").first().text().trim() ||
      null;

    const precioListaTxt =
      $card.find(".old-price .price, .price-was, .regular-price .price").first().text() ||
      $card.find(".price-wrapper .price, .price").first().text();
    const precioOfertaTxt =
      $card.find(".special-price .price, .price-final").first().text();

    const precio_lista = priceToNumber(precioListaTxt) ?? 0;
    const precio_oferta = priceToNumber(precioOfertaTxt);

    const img = $card.find("img").first();
    const imagen_url =
      img.attr("data-src") ||
      img.attr("data-original") ||
      img.attr("src") ||
      null;

    if (!nombre || !slug) return;

    products.push({
      sku_externo: slug,
      nombre,
      marca,
      precio_lista,
      precio_oferta: precio_oferta && precio_oferta !== precio_lista ? precio_oferta : null,
      imagen_url,
      url_dbs: url,
      categoria_path: categoriaPath,
      atributos: {},
    });
  });

  return products;
}

function detectLastPage(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  $('a[href*="?p="], li.item.pages-item-next a, .pages a').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&]p=(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
    const txt = $(el).text().trim();
    if (/^\d+$/.test(txt)) max = Math.max(max, Number(txt));
  });
  return max;
}

function discoverSubcategories(html: string, parentPath: string): string[] {
  const $ = cheerio.load(html);
  const subs = new Set<string>();
  $(`a[href^="${BASE}/${parentPath}/"], a[href^="/${parentPath}/"]`).each(
    (_, el) => {
      const href = $(el).attr("href") || "";
      const path = href
        .replace(BASE, "")
        .replace(/^\//, "")
        .replace(/\?.*$/, "")
        .replace(/#.*$/, "");
      // Solo subcategorías directas del padre, no productos
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 2 && parts[0] === parentPath) {
        subs.add(path);
      }
    }
  );
  return [...subs];
}

async function scrapeCategory(categoriaPath: string, maxPages: number) {
  const products: RawProduct[] = [];
  const seen = new Set<string>();

  console.log(`  [${categoriaPath}] página 1...`);
  const firstHtml = await fetchHtml(`${BASE}/${categoriaPath}`);
  await sleep(RATE_LIMIT_MS);

  const lastPage = Math.min(detectLastPage(firstHtml), maxPages);
  const firstPageProducts = extractProductsFromCategory(firstHtml, categoriaPath);
  for (const p of firstPageProducts) {
    if (!seen.has(p.sku_externo)) {
      seen.add(p.sku_externo);
      products.push(p);
    }
  }

  for (let p = 2; p <= lastPage; p++) {
    console.log(`  [${categoriaPath}] página ${p}/${lastPage}...`);
    try {
      const html = await fetchHtml(`${BASE}/${categoriaPath}?p=${p}`);
      const pageProducts = extractProductsFromCategory(html, categoriaPath);
      for (const prod of pageProducts) {
        if (!seen.has(prod.sku_externo)) {
          seen.add(prod.sku_externo);
          products.push(prod);
        }
      }
      if (pageProducts.length === 0) {
        console.log(`  [${categoriaPath}] página ${p} vacía, deteniendo paginación`);
        break;
      }
    } catch (e) {
      console.warn(`  [${categoriaPath}] página ${p} falló:`, (e as Error).message);
      break;
    }
    await sleep(RATE_LIMIT_MS);
  }

  return products;
}

async function main() {
  const args = parseArgs();

  const cats = args.only ? [args.only] : TOP_CATEGORIES;
  console.log(`Scraping DBS (${cats.length} top categories)`);

  const allProducts: RawProduct[] = [];
  const allSubcategories: string[] = [];

  for (const top of cats) {
    console.log(`\n→ ${top}`);

    // Descubrir subcategorías del top
    const html = await fetchHtml(`${BASE}/${top}`);
    await sleep(RATE_LIMIT_MS);
    const subs = discoverSubcategories(html, top);
    console.log(`  encontradas ${subs.length} subcategorías`);
    allSubcategories.push(top, ...subs);

    // Si no hay subcategorías, scrapear el top como leaf
    const targets = subs.length > 0 ? subs : [top];
    for (const target of targets) {
      try {
        const productos = await scrapeCategory(target, args.maxPages);
        console.log(`  [${target}] ${productos.length} productos extraídos`);
        allProducts.push(...productos);
      } catch (e) {
        console.warn(`  [${target}] falló:`, (e as Error).message);
      }
    }
  }

  // Dedup global por sku_externo (un producto puede aparecer en varias categorías)
  const dedup = new Map<string, RawProduct>();
  for (const p of allProducts) {
    if (!dedup.has(p.sku_externo)) dedup.set(p.sku_externo, p);
  }

  await fs.mkdir(args.outDir, { recursive: true });
  const outPath = path.join(args.outDir, "dbs-catalog.json");
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        scraped_at: new Date().toISOString(),
        total_productos: dedup.size,
        total_categorias: allSubcategories.length,
        categorias: allSubcategories,
        productos: [...dedup.values()],
      },
      null,
      2
    )
  );

  console.log(`\n✓ Guardado: ${outPath}`);
  console.log(`  ${dedup.size} productos únicos en ${allSubcategories.length} categorías`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
