-- Permite que la Edge Function confiable consulte el permiso de sede.
-- Los clientes anonimos y autenticados no pueden invocar directamente la funcion.
BEGIN;
GRANT EXECUTE ON FUNCTION public.tiene_permiso_sede(uuid, integer, text) TO service_role;
COMMIT;
