-- Un cobro del proveedor puede confirmar varios bloques de la misma cancha.
-- Cada bloque conserva su reserva y pase; el checkout raiz contiene el total del cobro.
BEGIN;
ALTER TABLE public.mp_checkout
  ADD COLUMN id_checkout_padre uuid REFERENCES public.mp_checkout(id) ON DELETE RESTRICT,
  ADD CONSTRAINT mp_checkout_padre_distinto CHECK (id_checkout_padre IS DISTINCT FROM id);
CREATE INDEX mp_checkout_padre_idx ON public.mp_checkout(id_checkout_padre)
  WHERE id_checkout_padre IS NOT NULL;
COMMENT ON COLUMN public.mp_checkout.id_checkout_padre IS
  'Bloque adicional de un pago unico. Solo la raiz crea preferencia y recibe mp_pago; cada fila conserva su propio pase.';
-- No cambia permisos ni RLS existentes; ningun acceso directo desde navegador.
COMMIT;
