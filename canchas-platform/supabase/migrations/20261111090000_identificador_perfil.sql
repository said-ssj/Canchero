-- Identificador público único: plazo de tres meses calendario, zona America/Lima.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.perfil_comunidad
 ADD COLUMN identificador varchar(30),
 ADD COLUMN identificador_cambiado_en timestamptz,
 ADD CONSTRAINT identificador_formato CHECK(identificador IS NULL OR identificador ~ '^[a-z0-9_.-]{3,30}$');
CREATE UNIQUE INDEX perfil_comunidad_identificador_unique ON public.perfil_comunidad(identificador) WHERE identificador IS NOT NULL;
CREATE FUNCTION public.controlar_cambio_identificador() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.identificador_cambiado_en := CASE WHEN NEW.identificador IS NULL THEN NULL ELSE now() END;
 ELSIF NEW.identificador IS DISTINCT FROM OLD.identificador THEN
   IF OLD.identificador IS NOT NULL AND NEW.identificador IS NULL THEN
     RAISE EXCEPTION 'No se puede eliminar el identificador' USING ERRCODE='23514';
   END IF;
   IF OLD.identificador_cambiado_en IS NOT NULL AND now() < ((OLD.identificador_cambiado_en AT TIME ZONE 'America/Lima') + interval '3 months') AT TIME ZONE 'America/Lima' THEN
     RAISE EXCEPTION 'Debes esperar tres meses desde el ultimo cambio de identificador' USING ERRCODE='23514';
   END IF;
   NEW.identificador_cambiado_en := now();
 ELSE
   NEW.identificador_cambiado_en := OLD.identificador_cambiado_en;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER perfil_identificador_cambio BEFORE INSERT OR UPDATE ON public.perfil_comunidad FOR EACH ROW EXECUTE FUNCTION public.controlar_cambio_identificador();
REVOKE ALL ON FUNCTION public.controlar_cambio_identificador() FROM PUBLIC,anon,authenticated;
COMMENT ON COLUMN public.perfil_comunidad.identificador IS 'Identificador publico voluntario, unico. Sin inventar nombres a partir de sedes ni importar datos locales automaticamente.';
COMMIT;
