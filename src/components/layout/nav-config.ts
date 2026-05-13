import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  Layers,
  Store,
  LayoutGrid,
  TrendingUp,
  Sparkles,
  PieChart,
  Bell,
  BookOpen,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hint?: string;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Análisis",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "SKUs", href: "/skus", icon: Package, hint: "~8.000 SKUs" },
      { label: "Categorías", href: "/categorias", icon: Layers },
      { label: "Tiendas", href: "/tiendas", icon: Store },
    ],
  },
  {
    label: "Acción",
    items: [
      { label: "Planogramas", href: "/planogramas", icon: LayoutGrid },
      { label: "Optimización", href: "/optimizacion", icon: Sparkles },
      { label: "Espacio por marca", href: "/optimizacion/espacio-marca", icon: PieChart },
      { label: "Tendencias", href: "/tendencias", icon: TrendingUp },
      { label: "Alertas", href: "/alertas", icon: Bell },
    ],
  },
  {
    label: "Ayuda",
    items: [
      { label: "Manual & Indicadores", href: "/manual", icon: BookOpen },
    ],
  },
];
