"use server"

import { createClient } from "@/lib/supabase/server"
import { generarPlanograma } from "@/lib/planogram/generate"
import type { GenerateConfig } from "@/lib/planogram/generate"

export type { GenerateConfig }

export async function crearPlanograma(
  nombre: string,
  config: GenerateConfig
): Promise<{ ok: true; planogramaId: string } | { ok: false; error: string }> {
  try {
    // Step 1: Run the generation algorithm
    const slots = await generarPlanograma(config)

    if (slots.length === 0) {
      return { ok: false, error: "No se encontraron SKUs para generar el planograma con la configuración indicada." }
    }

    // Step 2: Persist via RPC
    const sb = await createClient()
    const { data, error } = await (sb.rpc as any)("crear_planograma_generado", {
      p_nombre:       nombre,
      p_tienda_id:    config.tienda_id,
      p_categoria_id: config.categoria_id,
      p_n_bandejas:   config.n_bandejas,
      p_n_posiciones: config.n_posiciones,
      p_slots:        JSON.stringify(slots),
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, planogramaId: data as string }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido"
    return { ok: false, error: msg }
  }
}
