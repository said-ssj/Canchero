# Canchero: comunidad, partidos e inscripciones individuales

Estado: propuesta técnica adaptada al código local, 11 de noviembre de 2026. Este documento no significa que los módulos nuevos estén implementados, migrados o desplegados.

## 1. Decisiones confirmadas por el usuario

- Cada jugador paga su inscripción mediante Mercado Pago.
- El organizador paga primero el 100 % de la reserva de cancha, con el flujo existente.
- Los demás jugadores aportan su parte. Se registra el saldo a favor del organizador; no se realiza una transferencia automática a su cuenta.
- Se conservan Angular, Spring y Supabase. Las imágenes son referencias de estructura, nunca usuarios, tarifas, valoraciones o políticas reales.
- Se utilizan los medios efectivamente ofrecidos por Checkout Pro. No se inventan formularios de tarjeta, códigos Yape o un botón Plin operativo.

## 2. Qué existe y debe reutilizarse

| Necesidad | Fuente real actual | Adaptación |
| --- | --- | --- |
| Identidad | `usuario`, `perfil_jugador` | El participante referencia `usuario.id_usuario`; no confundirlo con `cliente.id_cliente`. |
| Presentación pública | `perfil_comunidad` | Conservar nombre, foto personal, biografía, portada e identificador. |
| Publicaciones | `publicacion_perfil` | Ya publica texto y fotos y tiene listado paginado. No crear otra tabla `posts`. |
| Seguimiento | `seguimiento_perfil` | Conservar seguidores reales; no generar contadores de ejemplo. |
| Sedes y canchas | `sede`, `cancha` | Derivar ubicación, deporte/formato, aforo y dueño del registro real. |
| Reserva y pago de cancha | `reserva`, `mp_checkout`, `mp_pago`, `pago_reserva` | Conservar el checkout actual para la compra inicial del organizador. |
| Pase e ingresos | `reserva_acceso`, `registro_ingreso` | Conservar token, límite global, vigencia e idempotencia existentes. |
| Cuentas y permisos | `ApiAuthorizationInterceptor`, `AuthTokenService`, asignaciones de negocio/sede | No sustituir ni ampliar roles de negocio para administrar un chat. |

Archivos revisados: `CommunityProfileService.java`, `CommunityProfileController.java`, `community-profile.service.ts`, `community-profile.ts/.html`, `MercadoPagoService.java`, `MercadoPagoWebhooks.java`, `ReservationAccessService.java`, `AuthTokenService.java`, `app.routes.ts` y `navbar.html`. Las rutas pertenecen a `canchas-platform/apps/api` y `canchas-platform/apps/web`.

Hallazgos que deben corregirse antes de declarar completa la comunidad:

- `toggleLike` cambia el contador únicamente en memoria. Una reacción debe persistir por API o quedar deshabilitada; no presentarla como guardada.
- Los comentarios muestran un aviso de función pendiente. Requieren tabla, API, permisos e interfaz.
- Las fotos de publicaciones se guardan hoy dentro de JSON. Separar medios y migrar a Storage exige una migración compatible; no borrar fotos existentes ni tratarlas como si ya estuvieran en un bucket.
- El token `canchero.v1` tiene cuatro segmentos y es una sesión propia de Spring; no es un JWT de Supabase. Google tampoco elimina esa diferencia automáticamente.
- El receptor de Webhooks actual concilia pagos de reservas. Las aportaciones necesitan un tipo de operación diferente y un despachador compatible con las referencias antiguas.

No se encontraron `AGENTS.md` ni `docs/CONTEXTO_LOCAL.md` en las dos raíces revisadas del proyecto activo. No se atribuyen reglas a archivos ausentes.

## 3. Modelo de dinero: dos operaciones diferentes

La reserva de cancha y una inscripción NO son el mismo pago.

1. El organizador compra la cancha. Solo una reserva pagada y confirmada, perteneciente a ese usuario y futura, puede publicarse como partido.
2. El sistema vincula un único partido a esa reserva. Publicar no vuelve a reservar ni a cobrar la cancha.
3. El organizador ocupa una plaza confirmada por la reserva que ya financió. No vuelve a pagar su cuota como otro participante.
4. Cada otro jugador paga una cuota fija. Su pago confirma su inscripción y aumenta el saldo a favor del organizador.
5. La deuda con el organizador no implica una transferencia realizada ni un ingreso adicional de la sede.

Ejemplo puramente contable: reserva de S/ 140, capacidad de 14 jugadores incluidos el organizador. Cuota de S/ 10; trece aportantes pueden generar S/ 130 de saldo a favor del organizador. No cobrar S/ 140 a cada jugador ni registrar S/ 270 como alquiler vendido por la sede.

La API calcula la cuota desde el importe real y el número de plazas publicadas, con centavos enteros o `numeric`, nunca `double` para el libro financiero. Propuesta de redondeo: la cuota de los aportantes se redondea hacia abajo al centavo y el organizador absorbe el resto. La cuota se congela antes del primer pago. Validar los importes mínimos del proveedor antes de publicar.

Saldo pendiente del organizador = aportes acreditados − reembolsos verificados de esos aportes − liquidaciones manuales registradas y conciliadas. El cargo original de la cancha no se duplica en ese saldo. Conservar historial inmutable de los movimientos y referencias únicas del proveedor.

Las comisiones del proveedor y cualquier comisión de Canchero deben tener una política expresa y mostrarse antes de pagar. No copiar un “S/ 0.00”, “5 %” o una rentabilidad de las capturas como si fueran condiciones reales. No prometer un importe neto al organizador sin decidir cómo se absorben los costos reales.

## 4. Medios de pago adaptados

| Medio | Presentación en Canchero |
| --- | --- |
| Mercado Pago / Checkout Pro | Una acción `Pagar mi inscripción con Mercado Pago`, con cuota calculada por el servidor. |
| Tarjeta | Se elige y se completa dentro del checkout del proveedor, si este la ofrece. Sin PAN/CVV en Angular ni en Spring. |
| Yape | Disponible únicamente cuando el checkout correspondiente lo ofrezca. No simular OTP ni usar una captura de un QR como acreditación automática. |
| Plin | No mostrarlo como pasarela habilitada sin soporte efectivo e integración verificada. Una transferencia directa al dueño es otro flujo manual. |
| Efectivo / transferencia presencial | Se conservan como operaciones presenciales autorizadas; no confirman una inscripción online por sí solas. |
| Medios de acreditación diferida | Excluirlos para una plaza con retención breve, o implementar primero una política distinta. Un pago tardío no recupera una plaza entregada a otro jugador. |

No es necesario agregar una Public Key al frontend para la redirección alojada actual. Las credenciales privadas continúan en la API. Esta propuesta conserva la cuenta receptora central de prueba; no incorpora marketplace, OAuth de vendedores ni transferencias automáticas.

## 5. Navegación y pantallas

- Navegación principal: Inicio, Sedes, Mi itinerario y Partidos. No duplicar Partidos con Matchmaking y Buscar partido como tres páginas equivalentes. Conservar Administración para quienes tengan permiso.
- Partidos contiene vistas `Partidos`, `Jugadores disponibles` y `Mis partidos`; un único bloque de filtros. Formato y deporte proceden del catálogo real; ubicación y fecha refinan las opciones disponibles.
- Listado con sede/cancha, fecha/hora, ambiente Casual/Competitivo, plazas confirmadas y plazas libres. Los retenidos se distinguen de los confirmados.
- Detalle con cancha y posiciones, equipos, participantes y detalles. La barra de inscripción permanece accesible al 100 % de zoom y en móvil.
- Resumen: posición, cuota real, condiciones y `Pagar mi inscripción con Mercado Pago`. La selección del instrumento se realiza en el proveedor.
- Icono de mensajes junto a las acciones de la cabecera. No mostrar un punto verde ni mensajes sin leer inventados.
- Perfiles conservan su base actual y añaden posición preferida y disponibilidad voluntarias. Sin nivel obligatorio ni filtro “Mi nivel”. No borrar datos existentes al retirar una clasificación de una pantalla.

Aplicar Angular Material, Google Material Symbols, paleta y tokens existentes, temas claro/oscuro/sistema, foco visible y adaptación móvil. Sin hover ni ripple; botones de solo icono transparentes, sin marco y con área igual al icono. Funciones pendientes: gris y deshabilitadas.

## 6. Modelo de datos propuesto, sin duplicar tablas

Los nombres son candidatos coherentes con el esquema en español; compararlos con el esquema real antes de escribir migraciones. Esta tabla no es SQL para ejecutar.

| Tabla | Finalidad |
| --- | --- |
| `publicacion_comentario` | Comentario, autor, publicación, fecha y estado; borrado autorizado y paginación. |
| `publicacion_reaccion` | Una reacción por usuario/publicación; unicidad e idempotencia. |
| `publicacion_medio` | Referencias de Storage y metadatos; migración compatible de las imágenes actuales. |
| `disponibilidad_jugador` | Preferencias voluntarias de formato, zona, posición y horario; sin dirección privada pública. |
| `partido` | Organizador, reserva pagada única, estado, ambiente, capacidad, cuota congelada y condiciones publicadas. |
| `partido_posicion` | Una fila por plaza, equipo, etiqueta y coordenadas del dibujo; cantidad limitada por el aforo real. |
| `partido_inscripcion` | Usuario, plaza, estado, vencimiento de retención y fuente de confirmación. El organizador se distingue del aportante. |
| `mp_inscripcion_checkout` | Operación de pago individual, referencia, importe, vencimiento e idempotencia. No crear una `reserva` por inscripción. |
| `mp_inscripcion_pago` | Pago individual verificado y su estado; `payment_id` único y relación con la inscripción. |
| `organizador_movimiento` | Aporte, devolución y liquidación manual auditados. No una columna de saldo editable por el navegador. |
| `chat_conversacion` | Tipo `privada` o `partido`; relación opcional con un partido. Un solo modelo de mensajes. |
| `chat_miembro` | Membresía, función en el chat, estado y fechas; no confundir administrador del chat con dueño/superadmin. |
| `chat_mensaje` | Contenido y versión de protección, autor, conversación, identificador de cliente único y fechas. |
| `comunidad_bloqueo` | Bloqueo entre personas, aplicado por el servidor. |
| `comunidad_reporte` | Reporte de mensaje, publicación o partido con permisos de revisión. |
| `partido_asistencia` | Participante identificado y asistencia validada; correcciones con motivo y auditoría. |

Usar FK a `usuario`, índices para relaciones y orden de paginación, `timestamptz` para instantes y zona America/Lima para visualización. Activar RLS en tablas expuestas y restringir grants de acuerdo con la ruta real de acceso. No abrir escrituras de pagos, membresías o cupos desde el navegador.

## 7. Retención de posiciones y pagos individuales

1. Crear exactamente las plazas publicadas, contando la del organizador y respetando la capacidad real. Dos equipos de fútbol 7 suman catorce participantes, no catorce por equipo.
2. En una transacción, bloquear la fila de la plaza, resolver una retención vencida y comprobar partido activo, plazo, usuario habilitado y ausencia de otra inscripción activa para la misma persona.
3. Estados diferenciados: `reservado_temporalmente`, `pendiente_pago`, `confirmado`, `vencido`, `cancelado`, `revision` y estados de devolución cuando corresponda.
4. Crear la preferencia fuera de los bloqueos de PostgreSQL, desde la cuota congelada. No aceptar importe, organizador, autor, equipo o confirmación desde un cuerpo manipulado.
5. Usar referencias distintas para aportes; conservar las referencias UUID antiguas de las reservas. El receptor verifica firma y consulta el recurso real antes de despachar a la operación correspondiente.
6. Verificar cuenta receptora, entorno, moneda, referencia e importe; aplicar el pago y el movimiento a favor del organizador una sola vez.
7. Una aprobación válida confirma esa inscripción. Un retorno sin pagar vuelve a su posición/resumen; no inventa un participante confirmado.
8. Si vence la retención, liberar solo la plaza. La cancha del organizador ya está pagada y no debe liberarse por un aporte abandonado.
9. Si llega una aprobación después de entregar la plaza a otro jugador, no desplazarlo ni resucitar la inscripción. Registrar revisión/devolución pendiente según la política que se implemente.

La unicidad de plazas activas se basa en estado persistido y transacciones, no en un índice con `now()` ni en deshabilitar botones de Angular. Dos pagos del mismo checkout no generan dos participantes; tampoco dos movimientos contables.

## 8. Cancelaciones y límites todavía por definir

No se han aprobado las promesas “reembolso automático si no se llena”, “hasta seis horas antes” o “devolución dos horas antes” de las imágenes.

Con la cancha pagada por adelantado, no llenarse no anula automáticamente la reserva. Propuesta inicial: el organizador absorbe plazas sin aportante. Debe informarse antes de publicar.

Antes de habilitar cobros individuales en el entorno publicado, definir:

- Cuándo puede retirarse un participante y qué importe se devuelve.
- Quién asume costos del proveedor y comisiones no recuperables.
- Qué ocurre si el organizador o la sede cancela el partido.
- Cómo se concilian reembolsos si el saldo del organizador ya fue liquidado manualmente.

Una solicitud de devolución no equivale a un reembolso ejecutado. Implementar el recurso real del proveedor, idempotencia, aprobación operativa y conciliación antes de anunciar devolución automática. La cancelación de la reserva matriz bloquea nuevas inscripciones y pagos pendientes, pero no borra registros financieros.

## 9. QR, asistencia y fiabilidad

El pase general existente tiene un contador compartido. Puede seguir usándose para la reserva del organizador, pero no emitir N cupos nuevos por cada inscripción ni enviar un pase general con N usos como si fuera un pase personal de un ingreso.

La ampliación debe asociar la admisión de un participante al mismo presupuesto de ingresos de la reserva. Si se añaden pases individuales, cada uno consume como máximo su cupo y también el contador global, dentro de una sola transacción. No regenerar capacidad por descargar, compartir o imprimir.

El QR compartido no demuestra qué persona asistió: por sí solo no sirve para calcular fiabilidad individual. Registrar asistencia de un participante identificado con validación del personal; excluir cancelaciones atribuibles a sede/organizador y permitir correcciones auditadas. Mostrar datos como “asistencias verificadas / partidos válidos”; no estrellas o insignias de verificado inventadas.

## 10. Chats: primero permisos, después E2EE

Avance del 11 de noviembre: la primera versión privada ya está implementada y verificada en local y con Supabase. Ver `MENSAJES_PRIVADOS.md`. Los grupos asociados a partidos y E2EE siguen siendo trabajo posterior.

Primera versión: acceso autenticado, verificación de participantes por API, historial paginado, bloqueo/reporte, límites de frecuencia y adjuntos privados solo cuando Storage esté configurado. Esta versión NO se anuncia como cifrado de extremo a extremo: el servidor puede procesar su contenido.

- Chat privado: exactamente dos participantes, pareja única normalizada, sin conversaciones duplicadas entre los mismos usuarios. Aplicar los bloqueos antes de crear, enviar o reabrir.
- Chat de partido: el organizador y las inscripciones confirmadas. No basta con conocer un ID de conversación. Invitados, plazas retenidas y pagos rechazados no acceden.
- La incorporación al grupo sigue la confirmación verificada. La retirada o expulsión debe respetar la política de acceso al historial; decidirla explícitamente y probarla.
- Administrador del chat gestiona el grupo dentro de límites; no obtiene permisos sobre sedes, stock, reservas ajenas o pagos.
- Archivos de chat en bucket privado; URLs firmadas de corta duración y comprobación de membresía antes de emitirlas. No reutilizar el acceso público de las fotos de sedes.

### Realtime y la sesión actual

No enviar `canchero.v1` a `supabase.realtime.setAuth` como si fuera un JWT aceptado por Supabase. La documentación de Realtime requiere autenticación compatible y autorización del canal privado mediante RLS. Se implementó y verificó en local el canje `/api/auth/realtime-token`, con identidad de `usuario`, caducidad breve y cliente separado. Ver `AUTH_SUPABASE_JWT.md`. Esto resuelve el formato y la confianza de firma sin migrar todas las cuentas a Supabase Auth. Aún faltan las políticas de membresía y las pruebas de expulsión del chat.

Mientras no se implementen las políticas de membresía, la API Spring puede entregar mensajes por REST con cursor y actualización limitada de la conversación visible. Mostrarlo honestamente como actualización periódica; no como chat Realtime ya conectado. No abrir canales públicos para evitar ese trabajo. Nunca colocar secretos de firma o `service_role` en Angular.

### E2EE posterior

Seleccionar una implementación mantenida y revisada, compatible con Angular/navegador, múltiples dispositivos, recuperación de claves y cambios de miembros. MLS es un protocolo a evaluar, no una librería ya integrada. No inventar cifrado con una clave compartida fija ni tratar tablas de claves públicas como un protocolo completo.

No crear ahora `user_public_keys` y `message_key_envelopes` como solución definitiva. El esquema debe derivarse de la implementación elegida. Los mensajes antiguos sin E2EE no se convierten retroactivamente en mensajes que el servidor nunca pudo leer. Reportar en E2EE puede exigir que el usuario comparta voluntariamente contenido para moderación; no prometer acceso secreto del administrador.

## 11. Fases ejecutables y criterios de cierre

| Fase | Entrega | Comprobación necesaria |
| --- | --- | --- |
| 0 | Cerrar y publicar el pago de reserva/pase ya preparado, por separado de esta ampliación | Compra de prueba completa, Webhook real, pase e ingresos; no mezclarlo con un falso éxito de inscripciones. |
| 1 | Comunidad existente: reacciones persistidas, comentarios paginados y medios compatibles | Reacción única por usuario, reintentos, eliminación propia, errores visibles, sin publicar datos privados ni contadores en memoria. |
| 2 | Partidos sobre reservas pagadas; listado, detalle, equipos, posiciones y disponibilidad voluntaria | Una reserva por partido, solo organizador real, precios desde servidor, sin duplicación de filtros ni posiciones; escritorio y móvil. |
| 3 | Inscripciones individuales, conciliación de aportes y saldo del organizador | Dos jugadores compiten por última plaza; solo uno obtiene retención. Aprobación idempotente, retorno abandonado, vencimiento y pago tardío. Sin doble ingreso de alquiler ni transferencia ficticia. |
| 4 | Privados y grupo del partido; bloqueo/reporte y acceso por membresía | Un tercero no lee ni envía; confirmado entra, rechazado no; expulsión corta acceso; historial paginado sin correos/teléfonos privados en búsqueda. |
| 5 | Admisión individual y fiabilidad verificable | Límite individual y global atómicos; el QR compartido no se utiliza para atribuir asistencia personal. |
| 6 | Realtime privado con identidad compatible y, posteriormente, E2EE | Pruebas de renovación/expulsión, cuotas y múltiples dispositivos; no declarar E2EE antes de su validación. |

Cada fase incluye migración aditiva revisada, pruebas en PostgreSQL temporal, API autorizada, interfaz Angular Material, errores reales y registro de estado. Primero ejecutar la migración en el entorno de prueba; no ocultar tablas ausentes con listas vacías o fixtures de producción. No repetir automáticamente migraciones sobre la BD compartida.

## 12. Uso del plan como instrucción de implementación

Trabajar una fase por entrega. Antes de editar, comparar fuentes y esquema reales con este inventario; no reiniciar la arquitectura ni borrar funcionalidades existentes. Conservar los cambios locales de pago, QR y perfiles que estaban pendientes al crear este documento.

No implementar simultáneamente los dos modelos de financiación ni activar cobros individuales hasta cerrar las condiciones del apartado 8. No publicar commits, desplegar, migrar credenciales o contratar servicios por el solo hecho de leer este plan. Distinguir siempre: propuesto, implementado, probado localmente, migrado y desplegado.

## Fuentes de referencia

- Supabase, autorización de Realtime: https://supabase.com/docs/guides/realtime/authorization
- Mercado Pago, retorno de Checkout Pro: https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/configure-back-urls
- IETF, MLS (RFC 9420): https://www.rfc-editor.org/rfc/rfc9420

La especificación del checkout y sus medios debe verificarse de nuevo antes de escribir esa fase. No inferir disponibilidad comercial o soporte de un método por aparecer en una imagen.
