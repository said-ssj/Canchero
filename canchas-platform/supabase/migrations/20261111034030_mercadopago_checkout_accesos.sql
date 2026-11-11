-- Canchero: estructura aditiva. Aplicada en Supabase y verificada el 2026-11-10 (Lima).
-- Aplicar sobre el esquema Canchero existente, no como instalacion desde cero.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.cancha ADD COLUMN capacidad_acceso integer CHECK(capacidad_acceso BETWEEN 1 AND 100);
-- Solo formatos conocidos: no inventar una capacidad para otras disciplinas.
UPDATE public.cancha c SET capacidad_acceso = 2 * substring(lower(t.nombre) from '(5|6|7|8|9|11)')::integer
 FROM public.tipo_cancha t WHERE t.id_tipo_cancha=c.id_tipo_cancha
 AND lower(t.nombre) ~ 'f[uú]tbol[[:space:]]*(5|6|7|8|9|11)([^0-9]|$)';

CREATE TABLE public.mp_checkout (
 id uuid PRIMARY KEY,
 id_reserva integer NOT NULL UNIQUE REFERENCES public.reserva(id_reserva) ON DELETE RESTRICT,
 id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
 clave_idempotencia varchar(100) NOT NULL,
 payload_hash varchar(64) NOT NULL,
 monto numeric(12,2) NOT NULL CHECK(monto>0),
 moneda varchar(3) NOT NULL DEFAULT 'PEN' CHECK(moneda='PEN'),
 cupos integer NOT NULL CHECK(cupos BETWEEN 1 AND 100),
 estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobado','rechazado','expirado','revision','reembolsado','contracargo')),
 collector_id varchar(30) NOT NULL,
 preference_id varchar(150) UNIQUE,
 checkout_url text,
 vence_en timestamptz NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id_usuario,clave_idempotencia)
);
CREATE INDEX mp_checkout_vencimiento_idx ON public.mp_checkout(vence_en) WHERE estado='pendiente';
CREATE TABLE public.mp_pago (
 payment_id varchar(30) PRIMARY KEY,
 id_checkout uuid NOT NULL REFERENCES public.mp_checkout(id) ON DELETE RESTRICT,
 estado varchar(40) NOT NULL,
 monto numeric(12,2) NOT NULL CHECK(monto>=0),
 aprobado_en timestamptz,
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_pago_checkout_idx ON public.mp_pago(id_checkout);
CREATE TABLE public.mp_webhook (
 payment_id varchar(30) PRIMARY KEY CHECK(payment_id ~ '^[0-9]{1,30}$'),
 revision bigint NOT NULL DEFAULT 1,
 pendiente boolean NOT NULL DEFAULT true,
 intentos integer NOT NULL DEFAULT 0 CHECK(intentos>=0),
 proximo_intento timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_webhook_pendientes_idx ON public.mp_webhook(proximo_intento) WHERE pendiente;

CREATE TABLE public.reserva_acceso (
 id uuid PRIMARY KEY REFERENCES public.mp_checkout(id) ON DELETE RESTRICT,
 token_hash varchar(64) NOT NULL UNIQUE,
 max_ingresos integer NOT NULL CHECK(max_ingresos BETWEEN 1 AND 100),
 ingresos_utilizados integer NOT NULL DEFAULT 0 CHECK(ingresos_utilizados>=0 AND ingresos_utilizados<=max_ingresos),
 estado varchar(15) NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','revocado')),
 creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.registro_ingreso (
 id uuid PRIMARY KEY,
 id_acceso uuid NOT NULL REFERENCES public.reserva_acceso(id) ON DELETE RESTRICT,
 id_empleado uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
 id_sede integer NOT NULL REFERENCES public.sede(id_sede) ON DELETE RESTRICT,
 id_peticion uuid NOT NULL,
 revierte_id uuid UNIQUE REFERENCES public.registro_ingreso(id) ON DELETE RESTRICT,
 tipo varchar(15) NOT NULL CHECK(tipo IN ('ingreso','reversion')),
 motivo varchar(300),
 fecha_hora timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id_acceso,id_peticion),
 CHECK((tipo='reversion')=(revierte_id IS NOT NULL)),
 CHECK(tipo<>'reversion' OR char_length(btrim(motivo)) BETWEEN 5 AND 300)
);
CREATE INDEX registro_ingreso_acceso_idx ON public.registro_ingreso(id_acceso,fecha_hora DESC);
CREATE INDEX registro_ingreso_empleado_idx ON public.registro_ingreso(id_empleado);
CREATE INDEX registro_ingreso_sede_idx ON public.registro_ingreso(id_sede,fecha_hora DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mp_checkout','mp_pago','mp_webhook','reserva_acceso','registro_ingreso'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
 IF to_regclass('public.permiso_sede') IS NOT NULL THEN
  INSERT INTO public.permiso_sede(codigo,descripcion) VALUES('pase.revertir','Revertir un ingreso accidental con motivo y auditoria') ON CONFLICT DO NOTHING;
  INSERT INTO public.rol_sede_permiso(rol_codigo,permiso_codigo) VALUES('admin','pase.revertir') ON CONFLICT DO NOTHING;
 END IF;
END $$;
COMMENT ON TABLE public.mp_checkout IS 'Checkout Pro en modo prueba. Referencia externa UUID; estados verificados por API, nunca por retorno del navegador.';
COMMENT ON TABLE public.reserva_acceso IS 'QR estatico con token seguro, solo hash en BD. Cupos consumidos bajo bloqueo transaccional.';
COMMIT;
