// Tipos del schema generados manualmente.
// Para regenerar desde Supabase real:
//   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts

export type RolUsuario = "analyst" | "admin";

export type Marca = {
  id: string;
  nombre: string;
  slug: string;
  propia: boolean;
  logo_url: string | null;
  created_at: string;
};

export type Categoria = {
  id: string;
  nombre: string;
  slug: string;
  parent_id: string | null;
  nivel: number; // 1 = familia, 2 = subfamilia, 3 = tipo
  ruta: string;  // p.ej. "maquillaje/labios/labiales"
  created_at: string;
};

export type Sku = {
  id: string;
  sku_externo: string;
  nombre: string;
  marca_id: string | null;
  categoria_id: string | null;
  precio_lista: number;
  precio_oferta: number | null;
  costo_unitario: number | null;
  imagen_url: string | null;
  url_dbs: string | null;
  descripcion: string | null;
  atributos: Record<string, unknown>;
  importado: boolean;
  lead_time_dias: number;
  activo: boolean;
  created_at: string;
};

export type Tienda = {
  id: string;
  nombre: string;
  ciudad: string;
  region: string;
  canal: "mall" | "calle" | "outlet";
  formato: "DBS Beauty Store" | "Tiendas MakeUp" | "Prismology" | "DJ Distribuidor";
  m2_lineales: Record<string, number>; // por familia: { Maquillaje: 8, Skincare: 6, ... }
  direccion: string | null;
  activa: boolean;
  created_at: string;
};

export type Usuario = {
  id: string;
  auth_user_id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
};

export type VentasFact = {
  id: string;
  sku_id: string;
  tienda_id: string;
  anio_mes: string; // ISO date primer dia del mes
  unidades: number;
  unidades_recibidas: number;
  ingreso: number;
  costo: number;
  margen: number;
  promo: boolean;
  descuento_pct: number;
};

export type InventarioFact = {
  id: string;
  sku_id: string;
  tienda_id: string;
  anio_mes: string;
  stock_inicio: number;
  stock_fin: number;
  stock_promedio: number;
  costo_inventario: number;
  dias_stock: number;
  mdi_meses: number;
};

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      marcas: TableDef<Marca>;
      categorias: TableDef<Categoria>;
      skus: TableDef<Sku>;
      tiendas: TableDef<Tienda>;
      usuarios: TableDef<Usuario>;
      ventas_fact: TableDef<VentasFact>;
      inventario_fact: TableDef<InventarioFact>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      rol_usuario: RolUsuario;
    };
    CompositeTypes: Record<string, never>;
  };
};
