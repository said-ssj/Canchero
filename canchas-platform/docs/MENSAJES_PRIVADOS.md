# Mensajes privados de Canchero

Primera entrega implementada el 11 de noviembre de 2026. Angular/Spring preparados en local; migración aplicada al Supabase existente. No se publicó en GitHub, Render o Vercel.

## Uso

- Abrir `/mensajes` mediante el icono de conversación de la barra superior.
- Desde un perfil ajeno, `Mensaje` abre una conversación entre las dos cuentas; WhatsApp mantiene su acción separada.
- La bandeja muestra nombre y foto personales, último mensaje y cantidad sin leer. No usa fotografías de sedes como avatar.
- Historial en páginas de 40, envío de texto de hasta 4000 caracteres y seguimiento de nuevos mensajes mediante cursor. Se conservan los IDs bigint como cadenas.
- Bloquear impide abrir/reabrir o enviar en ambas direcciones. Se conserva el historial y solo quien creó un bloqueo puede quitarlo. Los bloqueos del perfil ahora se guardan en el servidor; no dependen de localStorage.
- Reportar guarda el motivo con estado `pendiente`. No implica que un moderador haya actuado o recibido una notificación; el panel de revisión todavía está pendiente.

## Datos y permisos

Migración `supabase/migrations/20261112000005_mensajeria_privada.sql`:

| Tabla | Función |
| --- | --- |
| `chat_conversacion` | Pareja única ordenada de usuarios. |
| `chat_miembro` | Dos participantes y último mensaje leído. |
| `chat_mensaje` | Autor, texto, fecha e ID de solicitud para reintentos. |
| `chat_bloqueo` | Bloqueo persistido por cuenta. |
| `chat_reporte` | Reporte verificable de un participante. |

Las tablas tienen RLS y no otorgan lectura/escritura directa a anon/authenticated. Las operaciones pasan por la API; ni administradores ni dueños obtienen acceso automático a chats ajenos. No se usan correos/teléfonos para mostrar ni localizar destinatarios en la bandeja.

Cada operación exige sesión y membresía; la escritura comprueba que ambas cuentas estén activas y que no exista un bloqueo. Un advisory lock compartido por pareja serializa abrir, enviar y bloquear. El envío permite 30 mensajes por autor/minuto; los reintentos idénticos devuelven el mismo registro. El reporte permite hasta cinco por autor/día. La bandeja inicial devuelve hasta cien conversaciones ordenadas por actividad; una paginación adicional de bandeja queda pendiente para cuentas con más volumen.

Los mensajes se renderizan como texto, sin HTML. No hay éxito optimista: un error conserva el borrador y su ID de solicitud para reintentar.

## Realtime

Se usa el puente JWT de `AUTH_SUPABASE_JWT.md`. Es necesario esperar `realtime.setAuth(token)` antes del primer subscribe; la prueba real detectó y corrigió esta carrera.

El canal privado `chat-user:<usuario.id_usuario>` recibe solamente el evento `changed` con un ID de conversación. El trigger de inserción usa `realtime.send` como SECURITY INVOKER y notifica a los dos participantes. El navegador no puede publicar Broadcasts en este canal. La política limita extensión, tópico y claim firmado a la bandeja propia. No se transmite texto del chat en el evento.

La pantalla vuelve a pedir los mensajes a Spring y revalida el acceso. Un canal ajeno es denegado incluso con un JWT válido. Al salir de la página se cancela la suscripción. Si Realtime falla, se indica `Actualización periódica` y se consulta cada 30 segundos solo con la pestaña visible; no se promete una conexión activa cuando falla.

Se comprobó contra el Supabase real que la bandeja propia suscribe y la ajena devuelve CHANNEL_ERROR. No se enviaron mensajes sociales a usuarios reales para probarlo.

## Verificación

- PostgreSQL desechable: apertura simultánea, reintentos simultáneos, acceso de terceros denegado, bloqueos bilaterales, paginación/catch-up, no leídos, cuotas, reportes y RLS del canal.
- HTTP: sin sesión se rechaza la petición; el autor procede de la sesión y no del cuerpo enviado.
- Angular: escape de texto, IDs grandes, reintentos, respuestas tardías, errores y limpieza de suscripciones; perfil y puente JWT.
- Navegador real: bandeja conectada, estado vacío sin fixtures y móvil de 390 px sin desbordamiento horizontal.

## Alcance posterior

Esta versión permite texto privado; no tiene E2EE, adjuntos, mensajes editables, chat grupal, confirmación de lectura visible al remitente ni moderación administrativa implementada. El servidor puede procesar el contenido. Los grupos asociados a partidos deben incorporar únicamente al organizador y a participantes confirmados, según el plan aprobado. No crear un grupo de personas retenidas o con pagos rechazados.

Para publicar, desplegar primero la API y las variables de autenticación preparadas en la entrega anterior; después Angular. La migración ya está aplicada manualmente al proyecto y no debe ejecutarse otra vez como si fuera una BD vacía sin revisar su historial de migraciones.

Referencias: https://supabase.com/docs/guides/realtime/broadcast y https://supabase.com/docs/guides/realtime/authorization.
