import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { PrintButton } from "./PrintButton"

type Slot = {
  id: string
  bandeja: number
  posicion: number
  sku_id: string
  sku_nombre: string
  marca: string | null
  imagen_url: string | null
}

type PlanogramaPublico = {
  id: string
  nombre: string
  n_bandejas: number
  n_posiciones: number
  publicado_at: string
  tienda_nombre: string
  tienda_ciudad: string
  categoria_nombre: string
  slots: Slot[]
}

type Props = { params: Promise<{ token: string }> }

export default async function ReponedorPage({ params }: Props) {
  const { token } = await params
  const sb = await createClient()

  const { data, error } = await (sb.rpc as any)("get_planograma_por_token", {
    p_token: token,
  })

  if (error || !data) {
    notFound()
  }

  const planograma = data as PlanogramaPublico

  // Group slots by bandeja
  const bandejas = new Map<number, Slot[]>()
  for (let b = 1; b <= planograma.n_bandejas; b++) {
    bandejas.set(b, [])
  }
  for (const slot of planograma.slots ?? []) {
    const arr = bandejas.get(slot.bandeja) ?? []
    arr.push(slot)
    bandejas.set(slot.bandeja, arr)
  }

  const fechaPublicacion = new Date(planograma.publicado_at).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
        }
        body { margin: 0; font-family: system-ui, sans-serif; background: #fff; color: #111; }
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "2px solid #e5e7eb", paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#6b7280", marginBottom: 4 }}>
              DBS CATEGORY TRACKER
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px 0" }}>
              {planograma.nombre}
            </h1>
            <div style={{ fontSize: 14, color: "#374151" }}>
              {planograma.tienda_nombre} — {planograma.tienda_ciudad}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Categoría: {planograma.categoria_nombre} · Publicado: {fechaPublicacion}
            </div>
          </div>
          <PrintButton />
        </div>

        {/* Bandejas */}
        {Array.from(bandejas.entries()).map(([numBandeja, slots]) => {
          const isEyeLevel = numBandeja === 2 || numBandeja === 3
          return (
            <div key={numBandeja} style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 15,
                fontWeight: 600,
                margin: "0 0 10px 0",
                padding: "6px 12px",
                background: isEyeLevel ? "#fef3c7" : "#f3f4f6",
                borderRadius: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}>
                {isEyeLevel && <span>⭐</span>}
                Bandeja {numBandeja}
                {isEyeLevel && <span style={{ fontSize: 12, fontWeight: 400, color: "#92400e" }}>Eye Level</span>}
              </h2>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", width: 40, color: "#6b7280", fontWeight: 500 }}>#</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", width: 64, color: "#6b7280", fontWeight: 500 }}>Imagen</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 500 }}>SKU</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 500 }}>Marca</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", width: 64, color: "#6b7280", fontWeight: 500 }}>Repuesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.sort((a, b) => a.posicion - b.posicion).map((slot, idx) => (
                      <tr
                        key={slot.id}
                        style={{
                          borderBottom: idx < slots.length - 1 ? "1px solid #f3f4f6" : "none",
                          background: idx % 2 === 0 ? "#fff" : "#fafafa",
                        }}
                      >
                        <td style={{ padding: "10px 12px", color: "#9ca3af", fontWeight: 500 }}>
                          {slot.posicion}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {slot.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slot.imagen_url}
                              alt={slot.sku_nombre}
                              style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 4, border: "1px solid #e5e7eb" }}
                            />
                          ) : (
                            <div style={{ width: 48, height: 48, background: "#f3f4f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>
                              Sin img
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                          {slot.sku_nombre}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                          {slot.marca ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#10b981" }}
                            aria-label={`Marcar ${slot.sku_nombre} como repuesto`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 12, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
          Generado por DBS Category Tracker
        </div>
      </div>
    </>
  )
}
