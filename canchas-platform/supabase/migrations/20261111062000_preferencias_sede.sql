-- Aplicada y verificada en Supabase el 2026-11-11. No ejecutar de nuevo.
-- Ajustes por sede: sin modificar reservas ni activar cobros.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.sede ADD COLUMN porcentaje_adelanto_minimo smallint NOT NULL DEFAULT 50 CHECK(porcentaje_adelanto_minimo BETWEEN 10 AND 90);
ALTER TABLE public.sede ADD COLUMN billetera_titular varchar(150) NOT NULL DEFAULT '';
ALTER TABLE public.sede ADD COLUMN billetera_celular varchar(15) NOT NULL DEFAULT '';
REVOKE ALL (porcentaje_adelanto_minimo,billetera_titular,billetera_celular) ON public.sede FROM PUBLIC,anon,authenticated;
COMMENT ON COLUMN public.sede.billetera_titular IS 'Metadato del negocio. No vincula billetera ni cambia el receptor de Mercado Pago.';
COMMENT ON COLUMN public.sede.porcentaje_adelanto_minimo IS 'Preferencia de adelanto presencial; online permanece al 100 por ciento.';
COMMIT;
