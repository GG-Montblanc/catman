"use client"

export function PrintButton() {
  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{
        padding: "8px 16px",
        background: "#111827",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      🖨 Imprimir
    </button>
  )
}
