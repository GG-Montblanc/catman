import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const metadata = { title: "Tiendas" };

export default function TiendasPage() {
  return (
    <PlaceholderPage
      title="Tiendas"
      description="Performance por punto de venta y comparativa con tiendas similares."
      phase={1}
      bullets={[
        "KPIs por tienda: GMROI, Sellthru, ventas $, margen, fill rate.",
        "Mix de categorías y rentabilidad por bandeja/trasera ($/m² lineal).",
        "Comparativa contra benchmark de tiendas similares (mismo formato/región).",
        "Filtros: formato (DBS Beauty Store, Tiendas MakeUp, Prismology), canal, región.",
        "Mapa de Chile con tiendas codificadas por GMROI.",
      ]}
    />
  );
}
