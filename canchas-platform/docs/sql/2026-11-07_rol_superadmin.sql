-- Migración: Registro del rol superadmin en la base de datos
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.rol (nombre, descripcion, usucre)
SELECT v.nombre, v.descripcion, 'MIGRACION'
FROM (VALUES
    ('superadmin', 'Super Administrador de la plataforma: gestión integral de usuarios, asignación de roles y control total')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.rol r WHERE lower(r.nombre) = v.nombre);

COMMIT;
