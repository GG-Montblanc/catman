/**
 * scripts/fix-db.ts — limpieza via REST API, por tienda
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const sb = supabase as any;

async function countRows(table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return count;
}

async function deleteByTienda(table: string, tiendaIds: string[]): Promise<void> {
  for (let i = 0; i < tiendaIds.length; i++) {
    const tid = tiendaIds[i];
    const { error } = await sb.from(table).delete().eq("tienda_id", tid);
    if (error) {
      console.error(`  ✗ ${table} tienda ${i + 1}/${tiendaIds.length}: ${error.message}`);
    } else {
      process.stdout.write(`\r  ${table}: ${i + 1}/${tiendaIds.length} tiendas limpiadas`);
    }
    // pequeña pausa para no saturar
    await new Promise(r => setTimeout(r, 200));
  }
  console.log();
}

async function main() {
  console.log("=== DBS DB Fix — limpieza por tienda ===\n");

  // Estado inicial
  const vBefore = await countRows("ventas_fact");
  const iBefore = await countRows("inventario_fact");
  console.log(`Antes: ventas=${vBefore?.toLocaleString()}, inventario=${iBefore?.toLocaleString()}\n`);

  // Obtener lista de tiendas
  const { data: tiendas, error: tErr } = await sb.from("tiendas").select("id");
  if (tErr || !tiendas?.length) {
    console.error("No se pudieron obtener tiendas:", tErr?.message);
    process.exit(1);
  }
  const tiendaIds: string[] = tiendas.map((t: { id: string }) => t.id);
  console.log(`→ ${tiendaIds.length} tiendas encontradas\n`);

  // Borrar ventas_fact por tienda
  console.log("→ Limpiando ventas_fact...");
  await deleteByTienda("ventas_fact", tiendaIds);

  // Borrar inventario_fact por tienda
  console.log("→ Limpiando inventario_fact...");
  await deleteByTienda("inventario_fact", tiendaIds);

  // Borrar tiendas (pocas filas)
  console.log("→ Limpiando tiendas...");
  const { error: delT } = await sb.from("tiendas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delT) console.error("  ✗", delT.message);
  else console.log("  ✓ tiendas eliminadas");

  // Estado final
  const vAfter = await countRows("ventas_fact");
  const iAfter = await countRows("inventario_fact");
  const tAfter = await countRows("tiendas");
  console.log(`\nDespués: ventas=${vAfter?.toLocaleString()}, inventario=${iAfter?.toLocaleString()}, tiendas=${tAfter}`);

  if ((vAfter ?? 1) === 0 && (iAfter ?? 1) === 0) {
    console.log("\n✅ DB limpio. Listo para re-seedear con datos livianos.");
  } else {
    console.log("\n⚠️  Quedan filas — revisar errores arriba.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
