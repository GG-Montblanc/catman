import { createClient } from "@/lib/supabase/server"

export type Rol = "admin" | "analyst"

/**
 * Rol del usuario autenticado actual, leído de la tabla `usuarios` (columna
 * `rol`, ya existente). Si no hay fila o el usuario no está logueado,
 * retorna "analyst" (el default más restrictivo).
 */
export async function getCurrentUserRole(): Promise<Rol> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return "analyst"

  const { data } = await sb
    .from("usuarios")
    .select("rol")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  return (data?.rol as Rol | undefined) ?? "analyst"
}
