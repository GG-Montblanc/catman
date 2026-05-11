import { createClient } from "@/lib/supabase/server"
import { TendenciasClient } from "./TendenciasClient"

export const metadata = { title: "Tendencias — DBS Category Tracker" }

type Categoria = {
  id: string
  nombre: string
}

export default async function TendenciasPage() {
  const sb = await createClient()

  const { data } = await sb
    .from("categorias")
    .select("id, nombre")
    .is("parent_id", null)
    .order("nombre")

  const categorias = (data ?? []) as Categoria[]

  return <TendenciasClient categorias={categorias} />
}
