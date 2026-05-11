-- 0071_refresh_mv_rpc.sql
-- Función que refresca la materialized view mv_sku_kpis_mensual.
-- Solo puede ser llamada con service_role (SECURITY DEFINER + no grant a authenticated).

CREATE OR REPLACE FUNCTION public.refresh_mv_kpis_manual()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sku_kpis_mensual;
END;
$$;

-- Solo service_role puede llamar esta función (no authenticated)
REVOKE ALL ON FUNCTION public.refresh_mv_kpis_manual FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_mv_kpis_manual FROM authenticated;
-- service_role tiene acceso por defecto al ser SECURITY DEFINER con pg_authid superuser
