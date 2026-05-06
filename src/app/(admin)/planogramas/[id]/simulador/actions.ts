"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function guardarCambios(
  planogramaId: string,
  swaps: { slot_id: string; nuevo_sku_id: string }[],
  comentario?: string
) {
  const sb = await createClient()
  const { data, error } = await (sb.rpc as any)("guardar_version_planograma", {
    p_planograma_id: planogramaId,
    p_swaps:         JSON.stringify(swaps),
    p_comentario:    comentario ?? `${swaps.length} cambio(s) aplicado(s)`,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/planogramas/${planogramaId}/simulador`)
  return { ok: true, version: data?.version }
}
