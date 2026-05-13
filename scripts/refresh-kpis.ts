/**
 * scripts/refresh-kpis.ts
 *
 * Refresca la materialized view mv_sku_kpis_mensual.
 * Usar después de npm run seed:fake o cuando los KPIs muestran 0.
 *
 * Uso:
 *   npm run refresh:kpis
 */

import { config } from "dotenv"
config({ path: ".env.local" })
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  console.log("⏳ Refrescando mv_sku_kpis_mensual…")
  const t0 = Date.now()

  const { data, error } = await (supabase.rpc as any)("refresh_mv_kpis_manual")

  if (error) {
    console.error("✗ Error al refrescar la MV:", error.message)
    console.error("  Asegúrate de haber ejecutado la migración 0071_refresh_mv_rpc.sql en Supabase.")
    process.exit(1)
  }

  console.log(`✓ MV refrescada en ${Date.now() - t0}ms`)
  console.log(`  Resultado: ${data}`)

  // Verificar que hay datos
  const { count } = await (supabase as any)
    .from("mv_sku_kpis_mensual")
    .select("*", { count: "exact", head: true })
    .gt("gmroi", 0)

  console.log(`  ✓ ${(count ?? 0).toLocaleString()} filas con GMROI > 0 en la MV`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
