import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const metadata = { title: "Optimización" };

export default function OptimizacionPage() {
  return (
    <PlaceholderPage
      title="Optimización"
      description="Forecasting, recálculo mensual de GMROI, asignación óptima de espacio por marca y órdenes de compra sugeridas."
      phase={4}
      bullets={[
        "Quadrant matrix Sellthru × GMROI: Stars / Cash cows / Question marks / Dogs.",
        "Forecasting Holt-Winters por SKU con horizonte 12 meses (lead time 5 meses, target 10 semanas).",
        "Recálculo mensual de GMROI vía cron job + alertas de cambio de cuadrante.",
        "Asignación óptima de m² lineales por marca por planograma/tienda/canal/región.",
        "Listado exportable de órdenes de compra sugeridas para el equipo de buyers.",
      ]}
    />
  );
}
