-- Cuentas, compras y reportes se gestionan mediante Spring y TenantPermissions.
-- No elimina filas ni cambia contraseñas, propietarios o membresías.
BEGIN;
DO $$
DECLARE
    table_name text;
    column_names text;
    sequence_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['usuario', 'proveedor', 'compra', 'compra_detalle', 'reporte_cancha'] LOOP
        IF to_regclass(format('public.%I', table_name)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
        -- Incluye grants por columna, que un REVOKE sobre la tabla no elimina.
        SELECT string_agg(quote_ident(attname), ', ') INTO column_names
          FROM pg_attribute WHERE attrelid = to_regclass(format('public.%I', table_name))
           AND attnum > 0 AND NOT attisdropped;
        EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
                       column_names, table_name);
        FOR sequence_name IN
            SELECT pg_get_serial_sequence(format('public.%I', table_name), attname)
              FROM pg_attribute WHERE attrelid = to_regclass(format('public.%I', table_name))
               AND attnum > 0 AND NOT attisdropped
        LOOP
            IF sequence_name IS NOT NULL THEN
                EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated', sequence_name);
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Login" ON public.usuario;
DROP POLICY IF EXISTS "Permitir lectura publica de usuarios" ON public.usuario;
DROP POLICY IF EXISTS proveedor_auth_policy ON public.proveedor;
DROP POLICY IF EXISTS compra_auth_policy ON public.compra;
DROP POLICY IF EXISTS compra_detalle_auth_policy ON public.compra_detalle;
DROP POLICY IF EXISTS reporte_cancha_insert_policy ON public.reporte_cancha;
DROP POLICY IF EXISTS reporte_cancha_select_policy ON public.reporte_cancha;
DROP POLICY IF EXISTS reporte_cancha_update_policy ON public.reporte_cancha;

DO $$
BEGIN
    IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
    END IF;
END;
$$;
COMMIT;
