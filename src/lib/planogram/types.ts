export type SlotKpis = {
  avg_gmroi:      number | null
  avg_sellthru:   number | null
  avg_margen_pct: number | null
  avg_mdi:        number | null
  avg_fill_rate:  number | null
  total_ingreso:  number | null
  total_margen:   number | null
}

export type PlanogramSku = {
  id:           string
  nombre:       string
  sku_externo:  string
  imagen_url:   string | null
  precio_lista: number
  marca_nombre: string | null
  categoria_id: string
}

export type PlanogramSlot = {
  id:       string
  bandeja:  number
  posicion: number
  frente:   number
  sku:      PlanogramSku
  kpis:     SlotKpis | null
}

export type PlanogramData = {
  id:            string
  nombre:        string
  n_bandejas:    number
  n_posiciones:  number
  fecha_desde:   string | null
  fecha_hasta:   string | null
  tienda:        { id: string; nombre: string; ciudad: string }
  categoria:     { id: string; nombre: string; ruta: string }
  kpis_resumen:  SlotKpis | null
  slots:         PlanogramSlot[]
}

export type SwapCandidate = {
  id:             string
  nombre:         string
  imagen_url:     string | null
  precio_lista:   number
  sku_externo:    string
  marca_nombre:   string | null
  avg_gmroi:      number | null
  avg_sellthru:   number | null
  avg_margen_pct: number | null
  avg_mdi:        number | null
  total_ingreso:  number | null
  total_margen:   number | null
  delta_gmroi:      number | null
  delta_sellthru:   number | null
  delta_margen_pct: number | null
  delta_ingreso:    number | null
}

export type SwapCandidatesResponse = {
  current_kpis: SlotKpis | null
  candidatos:   SwapCandidate[]
}

// Pending swap before persisting
export type PendingSwap = {
  slot_id:    string
  bandeja:    number
  posicion:   number
  orig_sku:   PlanogramSku
  orig_kpis:  SlotKpis | null
  new_sku:    PlanogramSku
  new_kpis:   SlotKpis | null  // might be null for brand-new SKUs
}
