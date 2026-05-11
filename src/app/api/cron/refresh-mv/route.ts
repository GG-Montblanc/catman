/**
 * API Route: GET /api/cron/refresh-mv
 *
 * Refresca la materialized view mv_sku_kpis_mensual.
 * Vercel Cron llama este endpoint con el header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Configura CRON_SECRET en Vercel → Settings → Environment Variables.
 * También puede invocarse manualmente desde la UI de admin.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: Request) {
  // Vercel Cron environments automatically inject Authorization header.
  // For manual calls from the admin UI, accept the same header.
  const authHeader = req.headers.get("authorization")
  const secret     = process.env.CRON_SECRET

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 })
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const started = Date.now()

  // Execute a raw SQL REFRESH MATERIALIZED VIEW CONCURRENTLY via stored function
  const { error } = await (sb.rpc as any)("refresh_mv_kpis_manual")

  if (error) {
    console.error("[cron/refresh-mv] RPC error:", error.message)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }

  const elapsed = Date.now() - started
  console.log(`[cron/refresh-mv] MV refreshed in ${elapsed}ms`)

  return NextResponse.json({
    ok: true,
    refreshed_at: new Date().toISOString(),
    elapsed_ms: elapsed,
  })
}
