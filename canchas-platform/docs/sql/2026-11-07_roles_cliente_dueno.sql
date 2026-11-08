-- APLICADA el 2026-11-07 en Supabase. No volver a ejecutar alli (igual es segura: no duplica filas).
-- Aditiva: agrega los roles que espera la API ('cliente' para jugadores y 'dueno' para dueños de sede).
-- Sin ellos el registro web falla ("El rol solicitado no se encuentra disponible") y no existe ningún rol de dueño.
-- No cambia a los usuarios existentes: 'user' y 'userPremium' siguen funcionando como clientes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.rol (nombre, descripcion, usucre)
SELECT v.nombre, v.descripcion, 'MIGRACION'
FROM (VALUES
    ('cliente', 'Jugador: reserva canchas, paga y deja reseñas'),
    ('dueno', 'Dueño de sede: gestiona sus sedes, canchas, reservas, caja y punto de venta')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.rol r WHERE lower(r.nombre) = v.nombre);

COMMIT;
