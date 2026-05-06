-- 0001_catalog.sql — Catálogo: marcas, categorías jerárquicas, SKUs
-- Fuente: scraper de https://dbs.cl

create extension if not exists "pgcrypto";

-- ============================================================================
-- MARCAS
-- ============================================================================
create table if not exists public.marcas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  slug        text not null unique,
  propia      boolean not null default false,
  logo_url    text,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- CATEGORIAS (jerárquica: familia > subfamilia > tipo)
-- ============================================================================
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null,
  parent_id   uuid references public.categorias(id) on delete cascade,
  nivel       smallint not null check (nivel between 1 and 4),
  ruta        text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_categorias_parent on public.categorias(parent_id);
create index if not exists idx_categorias_nivel on public.categorias(nivel);

-- ============================================================================
-- SKUS
-- ============================================================================
create table if not exists public.skus (
  id              uuid primary key default gen_random_uuid(),
  sku_externo     text not null unique,
  nombre          text not null,
  marca_id        uuid references public.marcas(id) on delete set null,
  categoria_id    uuid references public.categorias(id) on delete set null,
  precio_lista    numeric(12,2) not null default 0,
  precio_oferta   numeric(12,2),
  costo_unitario  numeric(12,2),
  imagen_url      text,
  url_dbs         text,
  descripcion     text,
  atributos       jsonb not null default '{}'::jsonb,
  importado       boolean not null default true,
  lead_time_dias  integer not null default 150,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists idx_skus_marca on public.skus(marca_id);
create index if not exists idx_skus_categoria on public.skus(categoria_id);
create index if not exists idx_skus_activo on public.skus(activo);
create index if not exists idx_skus_atributos_gin on public.skus using gin (atributos);
