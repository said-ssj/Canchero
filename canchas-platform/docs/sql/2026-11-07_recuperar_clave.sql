-- APLICADA el 2026-11-07 en Supabase. No volver a ejecutar alli.
-- Aditiva: dos columnas opcionales; no modifica datos existentes.
-- Se guarda solo el hash SHA-256 del enlace (nunca el enlace en claro); vence a los 30 minutos y es de un solo uso.
-- Al cambiar password_hash, el trigger de 2026-11-07_bloqueo_login.sql desbloquea la cuenta.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.usuario
    ADD COLUMN reset_token_hash varchar(64),
    ADD COLUMN reset_expira timestamptz;

CREATE UNIQUE INDEX usuario_reset_token_hash ON public.usuario (reset_token_hash) WHERE reset_token_hash IS NOT NULL;

COMMIT;
