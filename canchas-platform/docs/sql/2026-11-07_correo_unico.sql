-- PENDIENTE de aplicar. Evita cuentas duplicadas cuando dos registros con el mismo correo llegan a la vez.
-- PASO 1 (solo lectura): si devuelve filas, hay correos repetidos; resolverlos a mano (desactivar/renombrar
-- la cuenta sobrante) ANTES del paso 2, o la creacion del indice fallara. No borrar usuarios con reservas.
SELECT lower(correo) AS correo, count(*) AS cuentas, array_agg(id_usuario) AS ids
FROM public.usuario
GROUP BY lower(correo)
HAVING count(*) > 1;

-- PASO 2: indice unico sin distinguir mayusculas. CONCURRENTLY no bloquea la tabla (no va dentro de BEGIN).
CREATE UNIQUE INDEX CONCURRENTLY usuario_correo_unico ON public.usuario (lower(correo));
