/**
 * scripts/generate-planograms.ts
 *
 * Crea planogramas demo sobre los datos sintéticos existentes.
 * Por cada categoría raíz × tienda seleccionada (top 3 tiendas por ingreso):
 *   1. Obtiene top SKUs de esa categoría ordenados por avg_gmroi (últimos 12m).
 *   2. Crea un planograma 5 bandejas × 20 posiciones.
 *   3. Asigna SKUs respetando eye-level (bandejas 2-3 = mejores KPIs).
 *
 * Uso:
 *   npm run seed:planogramas
 */

import { config } from "dotenv";
config({ path: ".env.local" })
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const N_BANDEJAS   = 5
const N_POSICIONES = 20

// Orden de asignación: eye-level primero (bandejas 2-3), luego 4, 1, 5
const PRIORITY_ORDER = [3, 2, 4, 1, 5]

async function main() {
  console.log("Generando planogramas demo...")

  // Limpiar planogramas previos para idempotencia
  await supabase.from("planograma_versiones").delete().neq("id", "00000000-0000-0000-0000-000000000000")
  await supabase.from("planograma_slots").delete().neq("id", "00000000-0000-0000-0000-000000000000")
  await supabase.from("planogramas").delete().neq("id", "00000000-0000-0000-0000-000000000000")

  // Obtener categorías raíz
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nombre, ruta")
    .eq("nivel", 1)
    .order("nombre")

  if (!categorias?.length) {
    console.error("No hay categorías. Ejecuta primero load:catalog y seed:fake.")
    process.exit(1)
  }
  console.log(`  ${categorias.length} categorías raíz encontradas`)

  // Obtener top 3 tiendas por total ingreso (del materialized view)
  const { data: topTiendas } = await supabase
    .from("tiendas")
    .select("id, nombre")
    .eq("activa", true)
    .limit(3)

  if (!topTiendas?.length) {
    console.error("No hay tiendas. Ejecuta seed:fake primero.")
    process.exit(1)
  }
  console.log(`  Usando ${topTiendas.length} tiendas`)

  let totalPlanogramas = 0
  let totalSlots = 0

  for (const tienda of topTiendas) {
    for (const cat of categorias) {
      process.stdout.write(`  [${tienda.nombre.slice(0, 30)}] ${cat.nombre}...`)

      // Top SKUs de esta categoría × tienda por avg_gmroi
      const { data: topSkus } = await supabase.rpc("get_skus_con_kpis" as any, {
        p_desde:    new Date(new Date().setMonth(new Date().getMonth() - 12))
                    .toISOString().slice(0, 10),
        p_hasta:    new Date().toISOString().slice(0, 10),
        p_categoria: cat.id,
        p_orden:    "gmroi_desc",
        p_limit:    N_BANDEJAS * N_POSICIONES,
        p_offset:   0,
      })

      const skus: { id: string }[] = (topSkus as any)?.skus ?? []
      if (skus.length < 5) {
        process.stdout.write(` skipped (${skus.length} SKUs)\n`)
        continue
      }

      // Crear planograma
      const { data: plan, error: planErr } = await supabase
        .from("planogramas")
        .insert({
          nombre:               `${cat.nombre} — ${tienda.nombre}`,
          tienda_id:            tienda.id,
          categoria_id:         cat.id,
          n_bandejas:           N_BANDEJAS,
          n_posiciones:         N_POSICIONES,
          fecha_vigencia_desde: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single()

      if (planErr || !plan) {
        console.error(`\n    Error: ${planErr?.message}`)
        continue
      }

      // Construir slots: priority order, fill sequentially
      const slots: { planograma_id: string; bandeja: number; posicion: number; sku_id: string; frente: number }[] = []
      let skuIdx = 0

      for (const bandeja of PRIORITY_ORDER) {
        for (let pos = 1; pos <= N_POSICIONES; pos++) {
          if (skuIdx >= skus.length) break
          slots.push({
            planograma_id: plan.id,
            bandeja,
            posicion: pos,
            sku_id: skus[skuIdx].id,
            frente: 1,
          })
          skuIdx++
        }
        if (skuIdx >= skus.length) break
      }

      const { error: slotsErr } = await supabase
        .from("planograma_slots")
        .insert(slots)

      if (slotsErr) {
        console.error(`\n    Slots error: ${slotsErr.message}`)
      } else {
        totalPlanogramas++
        totalSlots += slots.length
        process.stdout.write(` ${slots.length} slots\n`)
      }
    }
  }

  console.log(`\n✓ ${totalPlanogramas} planogramas creados con ${totalSlots} slots en total`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
