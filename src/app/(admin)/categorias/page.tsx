import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const metadata = { title: "Categorías" };

export default function CategoriasPage() {
  return (
    <PlaceholderPage
      title="Categorías"
      description="Análisis jerárquico familia → subfamilia → tipo (ej: Maquillaje > Labios > Labial mate)."
      phase={1}
      bullets={[
        "Selector jerárquico con KPIs agregados por nivel.",
        "Comparativa entre subfamilias (BarChart).",
        "Tendencias por atributo: % ventas tonos rojos vs nude, mate vs gloss, etc.",
        "SKUs líderes y rezagados de la categoría.",
        "Análisis por marca: espacio actual vs participación en ventas vs GMROI.",
      ]}
    />
  );
}
