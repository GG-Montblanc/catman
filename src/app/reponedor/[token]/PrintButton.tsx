"use client"

import { useState } from "react"

export function PrintButton() {
  const [printing, setPrinting] = useState(false)

  function handlePrint() {
    setPrinting(true)
    // Short delay lets React re-render (remove button animation) before print dialog opens
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 120)
  }

  return (
    <div
      className="no-print"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}
    >
      <button
        onClick={handlePrint}
        disabled={printing}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 18px",
          background: "#d4177a",
          color: "#fff",
          border: "none",
          borderRadius: 7,
          fontSize: 13,
          fontWeight: 600,
          cursor: printing ? "not-allowed" : "pointer",
          opacity: printing ? 0.7 : 1,
          whiteSpace: "nowrap",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          transition: "opacity 0.15s",
        }}
      >
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        {printing ? "Preparando…" : "Imprimir / PDF"}
      </button>
      <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "right", maxWidth: 160 }}>
        En el diálogo de impresión, elige<br />
        <strong style={{ color: "#6b7280" }}>Guardar como PDF</strong>
      </p>
    </div>
  )
}
