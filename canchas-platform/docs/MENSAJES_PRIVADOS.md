# Mensajes privados de Canchero

Primera entrega implementada el 11 de noviembre de 2026 y publicada en GitHub. Ampliación del 12 de noviembre: solicitudes entre seguidos, privacidad al bloquear y revisión de reportes. El código de esta ampliación permanece local; su migración ya se aplicó al Supabase existente.

## Solicitudes y aceptación (12 de noviembre)

- `/mensajes` permite buscar por nombre o identificador entre las personas seguidas y las conversaciones existentes. No fabrica chats para personas que todavía no se siguen.
- El iniciador debe seguir al destinatario. Si el destinatario todavía no lo sigue, puede enviar **un solo mensaje**. Una operación transaccional con bloqueo por pareja impide saltarse ese límite con envíos simultáneos. Un reintento con la misma clave no duplica el mensaje.
- Abrir el formulario no notifica una solicitud al destinatario: la bandeja entrante exige un mensaje realmente guardado.
- El destinatario puede **Seguir**, **Bloquear** o **Bloquear y reportar**. Seguir acepta sin abandonar el chat; se muestra «Siguiendo». La aceptación queda registrada y dejar de seguir después no cierra esa conversación.
- El menú de tres puntos permite bloquear o bloquear y reportar posteriormente. Bloquear elimina los seguimientos entre las dos cuentas, impide nuevos envíos y actualiza las bandejas.
- El bloqueo se comprueba en Spring para búsqueda, perfiles, publicaciones, seguimiento y chats. Una cuenta bloqueada recibe «Usuario Canchero», sin avatar, identificador ni contenido del perfil y sin sus acciones. Las respuestas personalizadas son privadas y `no-store`.
- Los perfiles siguen siendo públicos para visitantes sin sesión: el bloqueo protege las interacciones y respuestas de la cuenta identificada; no puede impedir que alguien cierre sesión, conserve datos que ya recibió o utilice otra cuenta. No se promete borrar historial ni fotos ya descargadas.
- Las conversaciones utilizadas antes de la migración conservan su aceptación para no cortar conversaciones previas.

## Reportes y revisión humana

Migración: `supabase/migrations/20261112060000_solicitudes_chat_privacidad.sql`, aplicada al proyecto el 12 de noviembre. No inserta personas, mensajes ni reportes de ejemplo.

1. Motivos: acoso, spam, estafa, odio/discriminación, violencia, contenido sexual, suplantación u otros. **Otros** exige una descripción de al menos diez caracteres. El bloqueo puede conservarse aunque se cierre la encuesta sin enviarla.
2. Solo se puede reportar a alguien de quien se recibió un mensaje en esa conversación. El destinatario reportado se deriva de la membresía; nunca de un ID enviado por el cliente.
3. Un reporte pendiente de la misma persona contra la misma cuenta no suma otra vez; tampoco se permite repetir uno revisado dentro de treinta días. Máximo cinco reportes por autor/día y diez conversaciones nuevas por iniciador/día.
4. Para contar en el umbral automático se exige una cuenta activa de **al menos siete días**, un perfil personal registrado y nombres/apellidos completos. La condición se guarda al registrar el reporte. No equivale a una identidad verificada ni hace imposible una campaña coordinada.
5. **Cinco denunciantes distintos que cumplan esos requisitos**, con reportes pendientes de los últimos treinta días, abren revisión y restringen **solo enviar mensajes y publicar durante 24 horas**. Una ráfaga de cinco denunciantes distintos en quince minutos abre revisión incluso si son cuentas nuevas, pero no basta para restringir automáticamente.
6. Un aviso visible al acceder y con actualización periódica informa del estado real. Reservas, pagos ya realizados, pases, lectura del chat, bloqueos y reportes permanecen accesibles. No se cambia `usuario.estado`, el rol ni la contraseña.
7. `/admin/moderacion`, exclusivo del superadministrador en la API, muestra los casos pendientes y los motivos con un mensaje recibido como evidencia por reporte. No otorga acceso general al historial privado.
8. El revisor justifica una decisión de descartar/levantar o mantener 24 horas. Se conserva auditoría en `chat_revision_decision`. Más reportes no prolongan indefinidamente una restricción automática pendiente. Una revisión pendiente puede seguir visible tras vencer el plazo; no se declara culpabilidad automática.

Las tablas de revisión tienen RLS y no conceden acceso directo a `anon`/`authenticated`. Los reportes de las pruebas se ejecutan en PostgreSQL desechable, nunca contra personas reales.

Verificación de esta ampliación: 282 pruebas de backend y 376 de Angular sin fallos; pruebas específicas de carrera de solicitudes, aceptación, privacidad, reportes duplicados, cuentas nuevas y revisión humana. Compilación y paquete correctos. Se verificaron consultas autenticadas reales a bandeja/contactos/estado y rechazo 403 del panel de moderación para un dueño. La inspección visual quedó pendiente: la revisión automática rechazó iniciar el frontend local con «blocked by policy».

## Uso

- Abrir `/mensajes` mediante el icono de conversación de la barra superior.
- Desde un perfil ajeno, `Mensaje` abre una conversación entre las dos cuentas; WhatsApp mantiene su acción separada.
- La bandeja muestra nombre y foto personales, último mensaje y cantidad sin leer. No usa fotografías de sedes como avatar.
- Historial en páginas de 40, envío de texto de hasta 4000 caracteres y seguimiento de nuevos mensajes mediante cursor. Se conservan los IDs bigint como cadenas.
- Bloquear impide abrir/reabrir o enviar en ambas direcciones. Se conserva el historial y solo quien creó un bloqueo puede quitarlo. Los bloqueos del perfil ahora se guardan en el servidor; no dependen de localStorage.
- Reportar guarda el motivo con estado `pendiente`. La ampliación descrita arriba agrega la cola de revisión y su resolución; no implica que un moderador ya haya actuado.

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

Esta versión permite texto privado; no tiene E2EE, adjuntos, mensajes editables, chat grupal ni confirmación de lectura visible al remitente. El servidor puede procesar el contenido. Los grupos asociados a partidos deben incorporar únicamente al organizador y a participantes confirmados, según el plan aprobado. No crear un grupo de personas retenidas o con pagos rechazados.

Para publicar, desplegar primero la API y las variables de autenticación preparadas en la entrega anterior; después Angular. La migración ya está aplicada manualmente al proyecto y no debe ejecutarse otra vez como si fuera una BD vacía sin revisar su historial de migraciones.

Referencias: https://supabase.com/docs/guides/realtime/broadcast y https://supabase.com/docs/guides/realtime/authorization.
