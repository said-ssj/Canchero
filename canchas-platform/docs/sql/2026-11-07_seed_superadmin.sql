-- Asegura el rol, pero nunca crea ni modifica cuentas superadmin.
-- Provisionar la cuenta por un procedimiento operativo seguro con contraseña
-- única. No guardar contraseñas ni hashes de cuentas privilegiadas en el repo.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.rol (nombre, descripcion, usucre)
SELECT 'superadmin',
       'Super Administrador de la plataforma: gestión integral de usuarios, asignación de roles y control total',
       'MIGRACION'
WHERE NOT EXISTS (
    SELECT 1 FROM public.rol WHERE lower(nombre) = 'superadmin'
);

COMMIT;
