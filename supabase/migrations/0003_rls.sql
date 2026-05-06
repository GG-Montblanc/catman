-- 0003_rls.sql — Row Level Security
-- App single-tenant: cualquier usuario autenticado puede leer todo.
-- Mutaciones solo via service role (scripts de carga, server actions futuras).

alter table public.marcas           enable row level security;
alter table public.categorias       enable row level security;
alter table public.skus             enable row level security;
alter table public.tiendas          enable row level security;
alter table public.usuarios         enable row level security;
alter table public.ventas_fact      enable row level security;
alter table public.inventario_fact  enable row level security;

-- Policy genérica: SELECT para autenticados
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'marcas','categorias','skus','tiendas','usuarios',
      'ventas_fact','inventario_fact'
    ])
  loop
    execute format($f$
      drop policy if exists "auth_select_%1$s" on public.%1$I;
      create policy "auth_select_%1$s"
        on public.%1$I
        for select
        to authenticated
        using (true);
    $f$, t);
  end loop;
end $$;

-- Auto-crear fila en public.usuarios al primer login (trigger sobre auth.users)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (auth_user_id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(split_part(new.email, '@', 1), 'Usuario'),
    'analyst'
  )
  on conflict (auth_user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
