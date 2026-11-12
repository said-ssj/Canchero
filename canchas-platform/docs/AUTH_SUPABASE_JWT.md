# Sesiones Canchero y JWT para Supabase

## Estado verificado el 11 de noviembre de 2026

- La clave `anon` local anterior era rechazada con `Invalid API key`. Se reemplazó **solo en `.env.local`** por la clave publishable vigente del mismo proyecto. Auth settings responde 200 y Google está habilitado.
- La API conserva su sesión firmada `canchero.v1`, el login bcrypt, el acceso Google, las identidades de `usuario` y la renovación con/sin mantener sesión. No se migraron contraseñas ni se crearon cuentas duplicadas en `auth.users`.
- `POST /api/auth/realtime-token` canjea una sesión válida por un JWT HS256 de hasta 300 segundos. Su vencimiento nunca supera el de la sesión Canchero. Respuesta con `Cache-Control: no-store`.
- La cuenta se comprueba en PostgreSQL antes de emitir el JWT. El navegador no proporciona el usuario, rol, negocio o sede del token.
- Se comprobó el JWT real de ese endpoint contra la Data API del proyecto: pasó la verificación de firma. La consulta a una tabla de prueba inexistente devuelve `PGRST205`, sin leer filas. Un intento de lectura de `usuario` devuelve 403.
- Se verificaron login normal del dueño, `/auth/me`, renovación y canje JWT con respuestas 200 y el mismo usuario/rol.
- El puente es infraestructura disponible para próximos módulos; no equivale a chats implementados ni a una migración completa a Supabase Auth.

## Credenciales y límites de confianza

| Variable | Dónde se usa | Regla |
| --- | --- | --- |
| `SUPABASE_URL` | Angular y Spring | Mismo proyecto que la BD y Google OAuth. |
| `SUPABASE_ANON_KEY` | Angular y Spring | Clave **publishable** vigente; conserva el nombre de variable por compatibilidad. Nunca `sb_secret_` o `service_role`. |
| `APP_AUTH_TOKEN_SECRET` | Solo Spring | Firma de las sesiones Canchero. Si falta, se acepta el antiguo `SUPABASE_JWT_SECRET` para no romper instalaciones existentes. |
| `SUPABASE_REALTIME_AUTH_ENABLED` | Solo Spring | Desactivado por defecto; activarlo después de revisar permisos y verificar la firma en el proyecto. |
| `SUPABASE_REALTIME_JWT_SECRET` | Solo Spring | Secreto HS256 efectivamente aceptado por Supabase, no una clave pública ni un texto aleatorio. No tiene fallback automático al secreto de sesiones. |

En la configuración local se conserva el valor previo de firma de sesiones para mantener compatibilidad; separar nombres no rota criptográficamente las claves. El proyecto todavía acepta la firma HS256 anterior, aunque Supabase Auth emite tokens ES256. Esta compatibilidad fue verificada, no deducida únicamente de JWKS.

No revocar ni rotar la firma anterior sin preparar el cambio del puente. A futuro conviene pasar a una clave importada dedicada o migrar las cuentas a Supabase Auth con correspondencia explícita de IDs; esas acciones no se realizaron en esta entrega.

El JWT del puente lleva `sub = usuario.id_usuario`, `aud = authenticated`, `role = authenticated`, emisor del proyecto, `iat`, `exp`, `jti` y `canchero_user_id`. **`authenticated` es el rol PostgreSQL de transporte, no “dueño”, “admin” o “superadmin”.** No autorizar con metadatos editables por el usuario. No usar el ID de `cliente` o el UUID Google como sustituto de este `sub`.

La API sigue aceptando exclusivamente las sesiones Canchero para operaciones del producto y comprueba sus permisos desde la BD. Un JWT del puente no permite iniciar sesión en Spring ni utilizar sus privilegios administrativos. Tampoco es una sesión administrada por `supabase.auth`: no usar `auth.setSession()` con este token ni inventar un refresh token.

## Acceso directo y políticas RLS

Se aplicó manualmente a Supabase `supabase/migrations/20261111234627_restringir_acceso_directo_cuentas_compras.sql`, además de probarla dos veces sobre PostgreSQL local desechable.

Se revocaron permisos de tabla, columna y secuencia a `PUBLIC`, `anon` y `authenticated` en `usuario`, `proveedor`, `compra`, `compra_detalle` y `reporte_cancha`. Se eliminaron sus políticas permisivas. La función trigger `handle_new_user()` ya no es ejecutable directamente por esos roles. No se eliminaron registros ni se cambiaron contraseñas. Spring conserva su conexión y los controles por negocio, sede y permiso.

No otorgar `USING (true)` a conversaciones para hacer funcionar Realtime. La entrega posterior de mensajes añadió una política limitada al canal de notificaciones de la propia cuenta, sin texto de chat; la membresía se revalida en Spring para consultar el contenido. El cliente asíncrono `RealtimeAuthService.privateChannel(topic)` inicializa el JWT y fuerza `private: true`. Los futuros canales grupales necesitarán sus propias comprobaciones. Ver `MENSAJES_PRIVADOS.md`.

El cliente solicita JWT a Spring mediante `accessToken`, los conserva únicamente en memoria, vuelve a pedirlos cerca de su caducidad, descarta respuestas de otra sesión y elimina sus canales al cerrar sesión/cambiar de usuario. No modifica el cliente OAuth de Google ni el cliente público de catálogo.

Un token copiado fuera del cliente puede seguir siendo válido hasta su vencimiento: cerrar sesión localmente no revoca instantáneamente un JWT externo. Para expulsión inmediata de participantes habrá que desconectar canales y verificar revocaciones del lado servidor; no prometer esa garantía con el puente actual.

## Comprobación local

Desde la raíz `canchas-platform`:

```powershell
node .\scripts\check-supabase-auth.mjs
.\scripts\start-api.ps1
```

El diagnóstico no escribe en la BD ni muestra claves, JWT, usuarios o filas. Se comprobó también que los secretos nuevos no aparecen en el archivo generado para Angular.

## Nube pendiente

No se hicieron commit, push ni cambios de variables en Render/Vercel en esta entrega. Para publicar: revisar el diff, desplegar el código y actualizar la **clave pública** vigente en ambos servicios. Las variables privadas del puente y de sesión pertenecen solo a Render. Verificar la firma contra el proyecto desplegado antes de activar canales privados. Nunca llevarlas a Vercel ni GitHub.

## Referencias

- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/guides/auth/signing-keys
- https://supabase.com/docs/guides/realtime/authorization
