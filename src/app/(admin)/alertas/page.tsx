import { createClient } from "@/lib/supabase/server"
import { AlertasPageClient } from "./AlertasPageClient"

export const metadata = { title: "Alertas — DBS Category Tracker" }

export type AlertaRow = {
  sku_id: string
  sku_nombre: string
  marca_nombre: string | null
  tipo_alerta: "dog" | "sobrestock" | "quiebre_riesgo" | "obsoleto"
  severidad: 1 | 2 | 3
  descripcion: string
  valor_gmroi: number | null
  valor_mdi: number | null
  imagen_url: string | null
}

export default async function AlertasPage() {
  const sb = await createClient()

  const { data: alertas } = await (sb.rpc as any)("get_alertas_dashboard", {
    p_limit: 200,
  })

  return <AlertasPageClient alertas={(alertas ?? []) as AlertaRow[]} />
}
