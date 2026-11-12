# Mercado Pago Checkout Pro — Canchero (prueba)

## Qué está implementado localmente

Horarios → Datos del partido → Convocados al partido → Revisar y pagar → Mercado Pago → Resultado.
El formulario de tarjeta, CVV y simulador de aprobación de Canchero se retiró. El proveedor muestra sus medios disponibles; no se inventa un código Yape en nuestra web. Convocados sigue siendo una calculadora temporal, sin invitaciones ni cobros a amigos; el titular paga el importe completo. Cupos de acceso se indica en Datos del partido y se valida contra la capacidad de la cancha.

La API calcula el precio, crea una reserva pendiente durante 10 minutos y luego una preferencia con referencia UUID. Los reintentos reutilizan la reserva y el primer enlace guardado. No se garantiza una sola preferencia remota ante solicitudes simultáneas, pero sus pagos nunca duplican la reserva ni el registro contable; pagos adicionales requieren revisión. No se llama a Mercado Pago dentro de una transacción de PostgreSQL.

El retorno del navegador no confirma un pago: la API consulta `/v1/payments/{id}`, verifica receptor de prueba, moneda PEN, monto, referencia y `live_mode=false`. Webhooks valida HMAC-SHA256, coincidencia del ID firmado con el cuerpo y antigüedad; persiste una bandeja de notificaciones y reintenta fuera de la petición. Notificaciones agotadas quedan pendientes para revisión (12 intentos), sin aprobación ficticia. Un pago tardío o adicional se marca para revisión; no recupera una cancha liberada. Reembolsos/contracargos revocan el pase; no hay emisión automática de reembolsos en este alcance.

El pase usa un token criptográfico; la BD guarda solo su hash. El QR contiene el token en el fragmento de `/accesos`, evitando incluirlo en la petición HTTP inicial. El empleado debe iniciar sesión y tener `pase.verificar` para esa sede. Cada ingreso es atómico e idempotente; se registran empleado, sede y hora. Ventana de acceso: 15 minutos antes del partido hasta su final. La reversión requiere `pase.revertir`, motivo y conserva auditoría; tiene endpoint, todavía no interfaz. El itinerario abre el resultado verificado para reservas Mercado Pago.

## Base de datos

Migración aditiva: `supabase/migrations/20261111034030_mercadopago_checkout_accesos.sql`.
Añade capacidad de acceso y tablas privadas de checkout, pagos, Webhooks, pases y movimientos. Mantiene RLS y revoca acceso directo de anon/authenticated. Solo los formatos fútbol conocidos reciben capacidad calculada; otros requieren configuración explícita. No ejecutar dos veces. No reconstruye el esquema anterior ni inserta reservas de ejemplo.

## Configuración de Webhooks

1. Entra a Mercado Pago Developers → Tus integraciones → aplicación **Canchero**, conservando RYA-TECH aparte.
2. Abre **Webhooks / Notificaciones Webhooks** y el entorno **Prueba**.
3. Configura como URL:
   `https://canchero-api-givn.onrender.com/api/payments/mercadopago/webhook`
4. Selecciona el evento **Pagos (Payments)** y guarda la configuración.
5. En esa misma sección busca **Firma secreta / Secret signature**, normalmente con la opción de revelar o copiar. Esta no es el Access Token ni la Public Key.
6. Guárdala como `MERCADOPAGO_WEBHOOK_SECRET` en `canchas-platform/.env.local`. No pegarla en el chat, Angular, Vercel ni Git.
7. Para el servidor publicado, colocar las mismas variables privadas en Render → canchero-api → Environment. La configuración del servidor fue guardada y desplegada el 11 de noviembre de 2026; todavía se debe comprobar una notificación firmada enviada por Mercado Pago.

Referencia oficial: https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks

Variables API (ver `.env.example`): `MERCADOPAGO_ENABLED`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_COLLECTOR_ID`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_PASS_SECRET`, `MERCADOPAGO_PUBLIC_URL`, `MERCADOPAGO_WEBHOOK_URL`. El secreto de pase generado en `.env.local` debe mantenerse estable y respaldarse privadamente: cambiarlo invalida los QR emitidos.

Desde el 11 de noviembre de 2026, Render tiene `MERCADOPAGO_ENABLED=true` con credenciales de prueba, firma y secreto de pases. La API pública informa `available=true` y `testMode=true`; esto no demuestra que un pago o Webhook completo haya sido aprobado. Para probar una API local con callbacks, se necesita un túnel HTTPS hacia el puerto real de esa API, y actualizar URL de Webhooks; no apuntar callbacks a localhost. APP_PUBLIC_URL de recuperación/Google no se modifica: Mercado Pago tiene su propia MERCADOPAGO_PUBLIC_URL.

## Prueba manual pendiente con el proveedor

Usar el comprador de prueba de Canchero, distinto del vendedor de prueba. Sus credenciales se consultan en Tus integraciones → Canchero → Cuentas de prueba; no utilizar la cuenta personal vendedora para comprarse a sí misma. Usar exclusivamente tarjetas de prueba oficiales de Checkout Pro, nunca tarjeta real. El prefijo APP_USR puede corresponder a credenciales de usuarios de prueba: no determina por sí solo si un pago es real.

Documentación: https://www.mercadopago.com/developers/es/docs/checkout-pro-preferences/test-accounts

Comprobar aprobado, pendiente/rechazado, retorno sin parámetros, Webhook repetido y manipulado, vencimiento, pago tardío, cancelar reserva, acceso por otra sede, último cupo simultáneo y reversión. No mostrar aprobado ni QR por un parámetro status del navegador. Para Yape: comprobar primero si el checkout de prueba lo ofrece; la documentación de OTP Yape de Checkout API no demuestra soporte en Checkout Pro y no se reutiliza aquí.

## Límites actuales

Implementación de prueba con una cuenta receptora de Canchero. No es marketplace, no reparte fondos a dueños, no certifica integración de producción ni concilia depósitos bancarios. El registro interno usa comisión cero hasta tener conciliación real; no representa una tarifa de Mercado Pago. Falta completar una compra de prueba y comprobar su notificación firmada antes de considerar verificado todo el flujo. La configuración de prueba y el código fueron publicados con autorización del usuario.

## Verificación automatizada

38 pruebas del checkout y 13 de la nueva integración con PostgreSQL real temporal aprobadas. Typecheck y build Angular pasan (advertencia previa de tamaño inicial; lector jsQR CommonJS). Suite general API: 234 casos, 7 fallos y 17 errores en pruebas existentes de caja/roles/listados; sus reportes incluyen falta de asignacion_sede en fixtures H2 y un caso de permiso de cajero en PostgreSQL. No se declara verde la suite completa ni se considera certificada la integración con el proveedor. Aún falta pago real de prueba y entrega de Webhooks firmada por Mercado Pago.

Arranque adicional de API comprobado en 8091 con Supabase: health UP, capabilities available=false/testMode=true y checkout sin sesión devuelve 401. Se detuvo la instancia temporal al terminar; la API habitual no se reinició.

## Correccion local del reintento (11 de noviembre de 2026)

Al volver desde Mercado Pago una pestaña puede enviar otra clave de operacion. La API recupera la misma retencion activa solo cuando coinciden cuenta, cancha, fecha, horas y cupos; serializa la seleccion por cuenta y no crea otra reserva. Nunca recupera retenciones vencidas, reservas confirmadas ni retenciones de otra cuenta. El vencimiento original no se amplía.

El controlador devuelve el motivo de ResponseStatusException en message. El checkout descarta títulos HTTP genéricos como Conflict y muestra una indicación en español. Las pruebas usan PostgreSQL local desechable; no se inventan cobros ni se modifican reservas de usuarios para verificarlo. El resultado de pago sigue dependiendo de la verificación del proveedor.


## Verificación del despliegue (11 de noviembre de 2026)

Render ejecutaba el commit 3c74993, anterior a los cambios de comunidad y pagos. Se guardaron únicamente las siete variables MERCADOPAGO autorizadas, conservando el resto de la configuración, y se desplegó 54353757 (incluye ad129067 y 490046b6). No se colocaron secretos en Vercel ni Git.

Verificado en la API pública: /health devuelve 200/UP; /api/community/profiles/search?q=alejandro devuelve 200 con dos resultados; un perfil público devuelve 200; /api/payments/mercadopago/capabilities devuelve available=true/testMode=true. Verificado en navegador: la búsqueda muestra ambas cuentas y abren el perfil propio y el de la otra cuenta.

Verificación dirigida previa al despliegue: 16 pruebas de Mercado Pago con PostgreSQL temporal, 5 HTTP y 40 de checkout aprobadas; typecheck aprobado. No equivale a una ejecución completa de todas las pruebas del repositorio ni a una compra aprobada por Mercado Pago.

Render está configurado para desplegar automáticamente después de pasar CI. Un push por sí solo no confirma que la nueva versión esté en vivo: comprobar el commit y el estado del despliegue. No se modificó esta condición.


## Regreso sin pagar y aprobación automática (11 de noviembre de 2026)

Implementado localmente: al volver sin identificador de pago, Resultado consulta la API. Solo si esta autoriza retomar una retención propia, activa, sin pagos registrados y no vencida, redirige a Convocados. Cancha, fecha, horas, cupos e importe se recuperan de PostgreSQL; los convocados adicionales son únicamente un borrador de interfaz de la misma pestaña y cuenta. No se crea otra reserva ni se amplía su vencimiento. Un pago pendiente real, aprobado, observado o una retención vencida permanece en Resultado. Se admite también collection_id y siempre se verifica en el servidor.

La API identifica las reservas de Mercado Pago incluso antes del cobro. El panel las separa de Por verificar y no permite aprobarlas/rechazarlas como transferencias manuales. La API también impide su confirmación manual, incluyendo pagos ya aprobados. La confirmación y el pase dependen de una aprobación validada por Webhook o consulta a Mercado Pago. Las reservas presenciales conservan su flujo independiente.

Se mantienen una cuenta receptora de prueba de Canchero y el vencimiento de diez minutos. No se implementó marketplace/OAuth de vendedores ni cobro directo por dueño. Los pagos manuales no se convierten en pagos de Mercado Pago y no se simulan confirmaciones. Sin cambios de esquema ni migraciones nuevas. Cambios aún sin commit/push ni despliegue de esta corrección.


## Pase descargable y compartido (11 de noviembre de 2026)

Cierre local del plan en PLAN_PASE_RESERVA_QR.md. Resultado ofrece PDF, imagen PNG y compartir PDF usando el mismo token y enlace canónico público del servidor. El documento incluye sede, dirección, cancha, fecha/hora de Perú, reserva, importe, cantidad autorizada y cupos disponibles al generarlo. Reconsulta el estado antes de exportar; no exporta pases agotados, vencidos, cancelados o revocados. Compartir no aumenta el contador y no envía mensajes automáticamente. El PDF identifica el modo prueba y no es comprobante fiscal.

Verificado con PostgreSQL temporal: emisión idempotente, un token por reserva pagada, copias con contador único, reintentos sin doble consumo, último cupo simultáneo, límites por sede y horario. Verificado documento de QA aislado: PDF A4 válido, renderizado inspeccionado y QR de PDF/PNG decodificado con contenido idéntico. Ningún pase de QA se insertó en Supabase. Estas correcciones siguen locales, sin commit/push ni despliegue. Falta compra de prueba completa contra el proveedor y recepción real del Webhook.
