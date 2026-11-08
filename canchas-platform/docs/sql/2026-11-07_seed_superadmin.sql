-- ============================================================================
-- Migración / Semilla: Creación de Usuario Superadministrador
-- ============================================================================
-- Credenciales asignadas:
--   Correo:     superadmin@canchero.pe
--   Contraseña: SuperAdmin2026!
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 1. Asegurar la existencia del rol superadmin en la tabla rol
INSERT INTO public.rol (nombre, descripcion, usucre)
SELECT v.nombre, v.descripcion, 'MIGRACION'
FROM (VALUES
    ('superadmin', 'Super Administrador de la plataforma: gestión integral de usuarios, asignación de roles y control total')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.rol r WHERE lower(r.nombre) = v.nombre);

-- 2. Insertar usuario superadmin si no existe aún (o actualizar su rol si ya existe)
DO $$
DECLARE
    v_id_rol INT;
    v_password_hash VARCHAR(255) := '$2b$10$53eUFw8Kdku55IV8o3jKeeh8poJLwIu992ToLYY6tSkgBb.qszNFu'; -- Hash bcrypt de 'SuperAdmin2026!'
BEGIN
    SELECT id_rol INTO v_id_rol FROM public.rol WHERE lower(nombre) = 'superadmin' LIMIT 1;

    IF EXISTS (SELECT 1 FROM public.usuario WHERE lower(correo) = 'superadmin@canchero.pe') THEN
        UPDATE public.usuario
        SET id_rol = v_id_rol,
            password_hash = v_password_hash,
            estado = 'A',
            intentos_fallidos = 0,
            bloqueo_hasta = NULL
        WHERE lower(correo) = 'superadmin@canchero.pe';
    ELSE
        INSERT INTO public.usuario (
            id_usuario,
            id_rol,
            nombre,
            correo,
            telefono,
            password_hash,
            estado,
            feccre,
            intentos_fallidos
        ) VALUES (
            gen_random_uuid(),
            v_id_rol,
            'Super Administrador',
            'superadmin@canchero.pe',
            '+51 999 888 777',
            v_password_hash,
            'A',
            now(),
            0
        );
    END IF;
END $$;

COMMIT;
