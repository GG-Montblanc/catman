import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const metadata = { title: "Tendencias" };

export default function TendenciasPage() {
  return (
    <PlaceholderPage
      title="Tendencias"
      description="Detección automática de tendencias por atributo, familia y subfamilia."
      phase={5}
      bullets={[
        "Selector categoría → atributo (tono, formato, textura, acabado).",
        "Línea 24 meses por valor de atributo (ej: rojos vs nude vs rosados en labiales).",
        "Detección automática de atributos en alza/baja (regresión sobre últimos 6 meses).",
        "Insights generados: 'Los tonos nude crecen 35% YoY mientras los rojos clásicos caen 12%'.",
        "Comparativa cross-categoría y cross-marca.",
      ]}
    />
  );
}
