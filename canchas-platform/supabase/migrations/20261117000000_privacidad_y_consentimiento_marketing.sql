BEGIN;

CREATE TABLE IF NOT EXISTS public.preferencias_notificacion (
    id_usuario uuid PRIMARY KEY REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    correo_reservas boolean NOT NULL DEFAULT true,
    recordatorios boolean NOT NULL DEFAULT true,
    fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preferencias_notificacion
    ADD COLUMN IF NOT EXISTS correos_marketing boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS consentimiento_marketing_en timestamptz,
    ADD COLUMN IF NOT EXISTS retiro_marketing_en timestamptz;

CREATE TABLE IF NOT EXISTS public.aceptacion_documento_legal (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    documento text NOT NULL CHECK (documento IN ('terminos', 'privacidad')),
    version text NOT NULL,
    aceptado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_usuario, documento, version)
);

CREATE TABLE IF NOT EXISTS public.solicitud_derechos_datos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    tipo text NOT NULL CHECK (tipo IN ('acceso', 'rectificacion', 'oposicion', 'supresion')),
    detalle text NOT NULL DEFAULT '',
    estado text NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'en_revision', 'atendida', 'rechazada')),
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS solicitud_derechos_usuario_fecha_idx
    ON public.solicitud_derechos_datos (id_usuario, creado_en DESC);

ALTER TABLE public.preferencias_notificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aceptacion_documento_legal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitud_derechos_datos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preferencias_notificacion, public.aceptacion_documento_legal,
    public.solicitud_derechos_datos FROM PUBLIC;

DO $$
DECLARE rol text;
BEGIN
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
            EXECUTE format(
                'REVOKE ALL ON public.preferencias_notificacion, public.aceptacion_documento_legal, public.solicitud_derechos_datos FROM %I',
                rol
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
