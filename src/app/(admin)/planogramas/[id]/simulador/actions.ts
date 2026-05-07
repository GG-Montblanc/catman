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

export async function publicarPlanograma(
  planogramaId: string
): Promise<{ ok: true; token: string; url: string } | { ok: false; error: string }> {
  const sb = await createClient()
  const { data, error } = await (sb.rpc as any)("publicar_planograma", {
    p_planograma_id: planogramaId,
  })
  if (error) return { ok: false, error: error.message }
  const token = data as string
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://category-tracker-iwo4-ljsd3lc7f-ggrandonmbcs-projects.vercel.app"
  const url = `${base}/reponedor/${token}`
  return { ok: true, token, url }
}
