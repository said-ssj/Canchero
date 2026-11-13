BEGIN;

-- Bump this value whenever the stored password changes. Existing sessions are
-- intentionally invalidated once when this column is introduced (version 1).
ALTER TABLE public.usuario
    ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.invalidate_sessions_after_password_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
        NEW.session_version := COALESCE(OLD.session_version, 1) + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usuario_invalidate_sessions_password ON public.usuario;
CREATE TRIGGER usuario_invalidate_sessions_password
    BEFORE UPDATE OF password_hash ON public.usuario
    FOR EACH ROW
    WHEN (OLD.password_hash IS DISTINCT FROM NEW.password_hash)
    EXECUTE FUNCTION public.invalidate_sessions_after_password_change();

-- Enforce reservation overlap prevention in PostgreSQL too, including writes
-- that bypass the API. Adjacent bookings are allowed by the [start, end) range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION public.reserva_intervalo_ts(
    p_fecha date,
    p_hora_inicio time,
    p_hora_fin time
) RETURNS tsrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT tsrange(
        p_fecha + p_hora_inicio,
        CASE
            WHEN p_hora_fin = TIME '00:00:00' AND p_hora_inicio > TIME '00:00:00'
                THEN p_fecha + INTERVAL '1 day'
            ELSE p_fecha + p_hora_fin
        END,
        '[)'
    );
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.reserva r
        WHERE r.estado = 'A'
          AND r.id_estado_reserva IN (1, 2)
          AND NOT (
              r.hora_fin > r.hora_inicio
              OR (r.hora_fin = TIME '00:00:00' AND r.hora_inicio > TIME '00:00:00')
          )
    ) THEN
        RAISE EXCEPTION 'No se puede instalar reserva_no_solapamiento_excl: existen reservas activas con rango horario inválido';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.reserva a
        JOIN public.reserva b
          ON a.id_cancha = b.id_cancha
         AND a.id_reserva < b.id_reserva
         AND a.estado = 'A' AND b.estado = 'A'
         AND a.id_estado_reserva IN (1, 2) AND b.id_estado_reserva IN (1, 2)
         AND public.reserva_intervalo_ts(a.fecha_reserva, a.hora_inicio, a.hora_fin)
             && public.reserva_intervalo_ts(b.fecha_reserva, b.hora_inicio, b.hora_fin)
    ) THEN
        RAISE EXCEPTION 'No se puede instalar reserva_no_solapamiento_excl: existen reservas activas solapadas; resuélvelas antes de reintentar';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.reserva'::regclass
          AND conname = 'reserva_no_solapamiento_excl'
    ) THEN
        ALTER TABLE public.reserva
            ADD CONSTRAINT reserva_no_solapamiento_excl
            EXCLUDE USING gist (
                id_cancha WITH =,
                public.reserva_intervalo_ts(fecha_reserva, hora_inicio, hora_fin) WITH &&
            )
            WHERE (estado = 'A' AND id_estado_reserva IN (1, 2));
    END IF;
END;
$$;

-- Direct browser uploads use the anon key today. Remove the permissive policy;
-- authenticated uploads are also disabled because this app authenticates at its
-- own API. Images will be uploaded through the authenticated server endpoint.
DROP POLICY IF EXISTS "subir imagenes canchero" ON storage.objects;

COMMIT;
