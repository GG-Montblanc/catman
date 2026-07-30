"use server"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { getCurrentUserRole } from "@/lib/auth/role"
import { revalidatePath } from "next/cache"

export type ImportRow = {
  sku_externo: string
  precio_lista?: number
  precio_oferta?: number | null
  costo_unitario?: number
  categoria?: string
  activo?: boolean
}

export type ImportResultado = {
  actualizados: number
  no_encontrados: string[]
  categoria_no_encontrada: string[]
  errores: { sku_externo: string; error: string }[]
}

/**
 * Importa/actualiza datos de catálogo (precio, costo, categoría, activo) desde
 * filas ya parseadas (CSV/Excel). Solo actualiza SKUs existentes -- no crea
 * productos nuevos (evita violar NOT NULL/FK sin resolver marca, imagen, etc.).
 * Escribe con el cliente service-role porque RLS no otorga UPDATE a
 * `authenticated` sobre `skus` (igual que los scripts de carga existentes).
 */
export async function importarSkus(rows: ImportRow[]): Promise<ImportResultado | { error: string }> {
  const rol = await getCurrentUserRole()
  if (rol !== "admin") {
    return { error: "Solo un usuario admin puede importar datos de catálogo" }
  }
  if (rows.length === 0) return { error: "No hay filas para importar" }
  if (rows.length > 5000) return { error: "Máximo 5.000 filas por importación" }

  const sb = createServiceRoleClient()
  const resultado: ImportResultado = {
    actualizados: 0,
    no_encontrados: [],
    categoria_no_encontrada: [],
    errores: [],
  }

  // Resolver nombres de categoría → id (una sola consulta)
  const nombresCategoria = [...new Set(rows.map(r => r.categoria).filter(Boolean))] as string[]
  const categoriaIdPorNombre = new Map<string, string>()
  if (nombresCategoria.length > 0) {
    const { data: cats } = await sb.from("categorias").select("id, nombre")
    for (const c of cats ?? []) {
      categoriaIdPorNombre.set(c.nombre.toLowerCase().trim(), c.id)
    }
  }

  // Resolver sku_externo → id existente (una sola consulta)
  const externos = rows.map(r => r.sku_externo.trim()).filter(Boolean)
  const { data: existentes } = await sb
    .from("skus")
    .select("id, sku_externo")
    .in("sku_externo", externos)
  const idPorExterno = new Map((existentes ?? []).map(s => [s.sku_externo, s.id]))

  for (const row of rows) {
    const externo = row.sku_externo.trim()
    if (!externo) continue

    const skuId = idPorExterno.get(externo)
    if (!skuId) {
      resultado.no_encontrados.push(externo)
      continue
    }

    const patch: Record<string, unknown> = {}
    if (row.precio_lista != null && !Number.isNaN(row.precio_lista)) patch.precio_lista = row.precio_lista
    if (row.precio_oferta !== undefined) patch.precio_oferta = row.precio_oferta
    if (row.costo_unitario != null && !Number.isNaN(row.costo_unitario)) patch.costo_unitario = row.costo_unitario
    if (row.activo !== undefined) patch.activo = row.activo
    if (row.categoria) {
      const catId = categoriaIdPorNombre.get(row.categoria.toLowerCase().trim())
      if (catId) patch.categoria_id = catId
      else resultado.categoria_no_encontrada.push(`${externo}: "${row.categoria}"`)
    }

    if (Object.keys(patch).length === 0) continue

    const { error } = await (sb.from("skus") as any).update(patch).eq("id", skuId)
    if (error) resultado.errores.push({ sku_externo: externo, error: error.message })
    else resultado.actualizados++
  }

  if (resultado.actualizados > 0) {
    revalidatePath("/skus")
  }

  return resultado
}
