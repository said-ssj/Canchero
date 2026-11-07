-- PENDIENTE de aplicar. Aplicar ANTES de desplegar la API que la usa (si no, el login falla).
-- Aditiva: solo agrega columnas con default y un trigger; no modifica datos existentes.
-- Politica (SupabaseDataService.login): 5 fallos -> espera de 30 s; 5 fallos mas (10) -> cuenta bloqueada
-- hasta que cambie la contrasena (el trigger reinicia el contador) o soporte la desbloquee:
--   UPDATE public.usuario SET intentos_fallidos = 0, bloqueo_hasta = NULL WHERE lower(correo) = '<correo>';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.usuario
    ADD COLUMN intentos_fallidos integer NOT NULL DEFAULT 0,
    ADD COLUMN bloqueo_hasta timestamptz;

CREATE FUNCTION public.usuario_reinicia_bloqueo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.intentos_fallidos := 0;
    NEW.bloqueo_hasta := NULL;
    RETURN NEW;
END $$;

CREATE TRIGGER usuario_reinicia_bloqueo_al_cambiar_clave
    BEFORE UPDATE OF password_hash ON public.usuario
    FOR EACH ROW WHEN (OLD.password_hash IS DISTINCT FROM NEW.password_hash)
    EXECUTE FUNCTION public.usuario_reinicia_bloqueo();

COMMIT;
