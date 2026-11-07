-- Ejecutar antes de desplegar el alta de productos. No modifica stock existente.
BEGIN;
ALTER TABLE public.categoria_producto
    ADD COLUMN IF NOT EXISTS id_sede integer REFERENCES public.sede(id_sede) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS categoria_producto_sede_nombre_idx
    ON public.categoria_producto(id_sede, lower(btrim(nombre))) WHERE estado = 'A' AND id_sede IS NOT NULL;
ALTER TABLE public.producto
    ADD COLUMN IF NOT EXISTS contenido numeric(12,3),
    ADD COLUMN IF NOT EXISTS unidad_medida varchar(20),
    ADD COLUMN IF NOT EXISTS descripcion text,
    ADD COLUMN IF NOT EXISTS foto_url text;
COMMENT ON COLUMN public.categoria_producto.id_sede IS
    'NULL: categoria compartida preexistente. Las nuevas categorias se crean para una sede por API.';
COMMENT ON COLUMN public.producto.contenido IS
    'Contenido por unidad vendida (ej. 600 ml). El stock y las ventas siguen contando unidades enteras.';
COMMIT;
