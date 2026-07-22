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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background: #fff;
          color: #111827;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 14mm 12mm 12mm 12mm;
          }

          .no-print { display: none !important; }

          body { font-size: 10pt; background: #fff !important; }

          /* Break between bandejas when needed */
          .bandeja-block { break-inside: avoid; page-break-inside: avoid; }

          /* Ensure table rows don't break across pages */
          tr { break-inside: avoid; page-break-inside: avoid; }

          /* Force background colors to print */
          thead tr { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .eye-level-header { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Reduce image size slightly for print */
          .sku-img { width: 38px !important; height: 38px !important; }

          /* Tight footer */
          .report-footer { margin-top: 16mm !important; }
        }
      `}</style>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px" }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "3px solid #d4177a",
        }}>
          <div>
            {/* DBS brand mark */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}>
              <div style={{
                width: 32, height: 32,
                borderRadius: 8,
                background: "#d4177a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: "-0.05em",
              }}>
                DBS
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.1em" }}>
                CATMAN
              </span>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px 0", lineHeight: 1.2 }}>
              {planograma.nombre}
            </h1>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13, color: "#374151" }}>
              <span>🏬 {planograma.tienda_nombre} — {planograma.tienda_ciudad}</span>
              <span>🏷️ {planograma.categoria_nombre}</span>
              <span>📅 {fechaPublicacion}</span>
              <span style={{ color: "#9ca3af" }}>
                {planograma.n_bandejas} bandejas · {planograma.n_posiciones} posiciones
              </span>
            </div>
          </div>
          <PrintButton />
        </div>

        {/* ── Leyenda ────────────────────────────────────────────────────────── */}
        <div className="no-print" style={{
          display: "flex",
          gap: 16,
          marginBottom: 20,
          fontSize: 12,
          color: "#6b7280",
          flexWrap: "wrap",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ background: "#fef3c7", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>⭐ Eye Level</span>
            Bandeja de mayor visibilidad
          </span>
          <span>☐ Casilla de verificación para marcar productos repuestos</span>
        </div>

        {/* ── Bandejas ───────────────────────────────────────────────────────── */}
        {Array.from(bandejas.entries()).map(([numBandeja, slots]) => {
          const isEyeLevel = numBandeja === 2 || numBandeja === 3
          return (
            <div key={numBandeja} className="bandeja-block" style={{ marginBottom: 24 }}>
              {/* Bandeja header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 14px",
                background: isEyeLevel ? "#fef3c7" : "#f3f4f6",
                borderRadius: "7px 7px 0 0",
                borderBottom: isEyeLevel ? "2px solid #f59e0b" : "2px solid #e5e7eb",
              }} className={isEyeLevel ? "eye-level-header" : ""}>
                {isEyeLevel && <span style={{ fontSize: 16 }}>⭐</span>}
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Bandeja {numBandeja}
                </span>
                {isEyeLevel && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#92400e",
                    background: "#fde68a",
                    padding: "2px 8px",
                    borderRadius: 99,
                  }}>
                    Eye Level
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>
                  {slots.length} producto{slots.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 7px 7px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "7px 10px", textAlign: "left", width: 36, color: "#9ca3af", fontWeight: 500, fontSize: 11 }}>#</th>
                      <th style={{ padding: "7px 10px", textAlign: "left", width: 58, color: "#9ca3af", fontWeight: 500, fontSize: 11 }}>Foto</th>
                      <th style={{ padding: "7px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600, fontSize: 11 }}>PRODUCTO</th>
                      <th style={{ padding: "7px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600, fontSize: 11, width: 110 }}>MARCA</th>
                      <th style={{ padding: "7px 10px", textAlign: "center", width: 70, color: "#6b7280", fontWeight: 600, fontSize: 11 }}>REPUESTO</th>
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
                        <td style={{ padding: "9px 10px", color: "#d1d5db", fontWeight: 600, fontSize: 11 }}>
                          {slot.posicion}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          {slot.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slot.imagen_url}
                              alt={slot.sku_nombre}
                              className="sku-img"
                              style={{ width: 46, height: 46, objectFit: "contain", borderRadius: 4, border: "1px solid #e5e7eb" }}
                            />
                          ) : (
                            <div style={{ width: 46, height: 46, background: "#f3f4f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#9ca3af" }}>
                              Sin<br />img
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "9px 10px", fontWeight: 500, fontSize: 13, lineHeight: 1.3 }}>
                          {slot.sku_nombre}
                        </td>
                        <td style={{ padding: "9px 10px", color: "#6b7280", fontSize: 12 }}>
                          {slot.marca ?? "—"}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            style={{ width: 17, height: 17, cursor: "pointer", accentColor: "#d4177a" }}
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

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="report-footer" style={{
          marginTop: 40,
          paddingTop: 14,
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "#9ca3af",
        }}>
          <span>DBS CatMan — Guía de reposición generada automáticamente</span>
          <span>{new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}</span>
        </div>
      </div>
    </>
  )
}
