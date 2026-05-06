-- 0002_facts.sql — Estructura comercial + tablas de hechos
-- Phase 0: ventas e inventario sintéticos generados sobre el catálogo real.

-- ============================================================================
-- TIENDAS
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'canal_tienda') then
    create type canal_tienda as enum ('mall', 'calle', 'outlet');
  end if;
  if not exists (select 1 from pg_type where typname = 'formato_tienda') then
    create type formato_tienda as enum (
      'DBS Beauty Store',
      'Tiendas MakeUp',
      'Prismology',
      'DJ Distribuidor'
    );
  end if;
end $$;

create table if not exists public.tiendas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  ciudad        text not null,
  region        text not null,
  canal         canal_tienda not null,
  formato       formato_tienda not null,
  m2_lineales   jsonb not null default '{}'::jsonb,
  activa        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tiendas_region on public.tiendas(region);
create index if not exists idx_tiendas_formato on public.tiendas(formato);

-- ============================================================================
-- USUARIOS (rol único por ahora: analyst)
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_usuario') then
    create type rol_usuario as enum ('analyst', 'admin');
  end if;
end $$;

create table if not exists public.usuarios (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  email         text not null unique,
  nombre        text not null,
  rol           rol_usuario not null default 'analyst',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_usuarios_auth_user on public.usuarios(auth_user_id);

-- ============================================================================
-- VENTAS FACT (mensual, por SKU × tienda)
-- ============================================================================
create table if not exists public.ventas_fact (
  id                  uuid primary key default gen_random_uuid(),
  sku_id              uuid not null references public.skus(id) on delete cascade,
  tienda_id           uuid not null references public.tiendas(id) on delete cascade,
  anio_mes            date not null,  -- siempre primer día del mes
  unidades            integer not null default 0,
  unidades_recibidas  integer not null default 0,
  ingreso             numeric(14,2) not null default 0,
  costo               numeric(14,2) not null default 0,
  margen              numeric(14,2) generated always as (ingreso - costo) stored,
  promo               boolean not null default false,
  descuento_pct       numeric(5,2) not null default 0,
  unique (sku_id, tienda_id, anio_mes)
);

create index if not exists idx_ventas_sku_mes on public.ventas_fact(sku_id, anio_mes);
create index if not exists idx_ventas_tienda_mes on public.ventas_fact(tienda_id, anio_mes);
create index if not exists idx_ventas_anio_mes on public.ventas_fact(anio_mes);

-- ============================================================================
-- INVENTARIO FACT (mensual, por SKU × tienda)
-- ============================================================================
create table if not exists public.inventario_fact (
  id                uuid primary key default gen_random_uuid(),
  sku_id            uuid not null references public.skus(id) on delete cascade,
  tienda_id         uuid not null references public.tiendas(id) on delete cascade,
  anio_mes          date not null,
  stock_inicio      integer not null default 0,
  stock_fin         integer not null default 0,
  stock_promedio    numeric(12,2) not null default 0,
  costo_inventario  numeric(14,2) not null default 0,
  dias_stock        numeric(8,2) not null default 0,
  mdi_meses         numeric(8,2) not null default 0,
  unique (sku_id, tienda_id, anio_mes)
);

create index if not exists idx_inv_sku_mes on public.inventario_fact(sku_id, anio_mes);
create index if not exists idx_inv_tienda_mes on public.inventario_fact(tienda_id, anio_mes);
