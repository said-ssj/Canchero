-- Estructura aditiva. No genera correos historicos ni activa envios.
BEGIN;
CREATE TABLE IF NOT EXISTS public.preferencias_notificacion (
    id_usuario uuid PRIMARY KEY REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    correo_reservas boolean NOT NULL DEFAULT true,
    recordatorios boolean NOT NULL DEFAULT true,
    fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reserva_correo_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_reserva integer NOT NULL REFERENCES public.reserva(id_reserva) ON DELETE CASCADE,
    id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    evento text NOT NULL CHECK (evento IN ('registrada','confirmada','cancelada','reprogramada','recordatorio')),
    revision text NOT NULL,
    datos jsonb NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','enviado','omitido','fallido')),
    intentos integer NOT NULL DEFAULT 0,
    proximo_intento timestamptz NOT NULL DEFAULT now(),
    creado_en timestamptz NOT NULL DEFAULT now(),
    enviado_en timestamptz,
    UNIQUE (id_reserva,evento,revision)
);
CREATE INDEX IF NOT EXISTS reserva_correo_pendiente_idx ON public.reserva_correo_outbox(estado,proximo_intento);

CREATE OR REPLACE FUNCTION public.reserva_correo_datos(reserva_id integer)
RETURNS jsonb LANGUAGE sql SET search_path = pg_catalog,public AS $$
    SELECT jsonb_build_object('sede',s.nombre,'cancha',c.nombre_numero,
        'fecha',r.fecha_reserva,'inicio',to_char(r.hora_inicio,'HH24:MI'),'fin',to_char(r.hora_fin,'HH24:MI'),
        'estado',lower(er.nombre))
    FROM public.reserva r JOIN public.cancha c ON c.id_cancha=r.id_cancha
    JOIN public.sede s ON s.id_sede=c.id_sede
    JOIN public.estado_reserva er ON er.id_estado_reserva=r.id_estado_reserva WHERE r.id_reserva=reserva_id
$$;
CREATE OR REPLACE FUNCTION public.encolar_correo_reserva()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
DECLARE autor uuid; datos jsonb; tipo text; estado_nombre text;
BEGIN
    IF NEW.estado <> 'A' THEN RETURN NEW; END IF;
    SELECT coalesce(NEW.id_usuario, cl.id_usuario) INTO autor FROM public.cliente cl WHERE cl.id_cliente=NEW.id_cliente;
    autor := coalesce(NEW.id_usuario,autor);
    IF autor IS NULL THEN RETURN NEW; END IF;
    datos := public.reserva_correo_datos(NEW.id_reserva);
    estado_nombre := datos->>'estado';
    IF TG_OP='INSERT' THEN
        IF estado_nombre LIKE '%cancel%' OR estado_nombre LIKE '%complet%' THEN RETURN NEW; END IF;
        tipo := CASE WHEN estado_nombre LIKE '%confirm%' OR estado_nombre LIKE '%aprob%' THEN 'confirmada' ELSE 'registrada' END;
    ELSE
        IF NEW.id_estado_reserva IS DISTINCT FROM OLD.id_estado_reserva AND estado_nombre LIKE '%cancel%' THEN tipo := 'cancelada';
        ELSIF (NEW.fecha_reserva,NEW.hora_inicio,NEW.hora_fin) IS DISTINCT FROM (OLD.fecha_reserva,OLD.hora_inicio,OLD.hora_fin)
            AND estado_nombre NOT LIKE '%cancel%' AND estado_nombre NOT LIKE '%complet%' THEN tipo := 'reprogramada';
        ELSIF NEW.id_estado_reserva IS DISTINCT FROM OLD.id_estado_reserva
            AND (estado_nombre LIKE '%confirm%' OR estado_nombre LIKE '%aprob%') THEN tipo := 'confirmada';
        ELSE RETURN NEW; END IF;
    END IF;
    INSERT INTO public.reserva_correo_outbox(id_reserva,id_usuario,evento,revision,datos)
    VALUES (NEW.id_reserva,autor,tipo,md5(datos::text || coalesce(NEW.fecmod::text,NEW.feccre::text,'')),datos)
    ON CONFLICT (id_reserva,evento,revision) DO NOTHING;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reserva_correo_eventos ON public.reserva;
CREATE TRIGGER reserva_correo_eventos AFTER INSERT OR UPDATE OF id_estado_reserva,fecha_reserva,hora_inicio,hora_fin
    ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.encolar_correo_reserva();

ALTER TABLE public.preferencias_notificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserva_correo_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preferencias_notificacion,public.reserva_correo_outbox FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserva_correo_datos(integer), public.encolar_correo_reserva() FROM PUBLIC;
DO $$ DECLARE rol text; BEGIN
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=rol) THEN
            EXECUTE format('REVOKE ALL ON public.preferencias_notificacion,public.reserva_correo_outbox FROM %I',rol);
            EXECUTE format('REVOKE ALL ON FUNCTION public.reserva_correo_datos(integer),public.encolar_correo_reserva() FROM %I',rol);
        END IF;
    END LOOP;
END $$;
COMMIT;
