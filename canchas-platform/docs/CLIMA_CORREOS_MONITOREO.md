# Clima, correos de reservas y monitoreo

Implementación local del 2026-11-07. No requiere cambiar los contratos de reservas, pagos o perfil.

## Clima

Open-Meteo se consulta desde la API, usando exclusivamente las coordenadas de la sede activa/publicada. No pide ubicación del jugador ni utiliza una ciudad ficticia si faltan coordenadas.

- Detalle de sede: condiciones actuales estimadas, icono y temperatura.
- Selección de horarios: pronóstico de la fecha y hora inicial del bloque válido.
- Mi itinerario: solo reservas próximas no canceladas/finalizadas. Una línea discreta de icono, temperatura y probabilidad de lluvia; sin tarjeta, fondo, animaciones, alertas o skeleton. Si no hay pronóstico no se muestra.
- Fuente con atribución a Open-Meteo. No se cancela ni bloquea una reserva por el pronóstico.
- GET /api/venues/{id}/weather devuelve condiciones actuales y 168 horas, con zona America/Lima.
- Caché por sede de 20 minutos en API y navegador. Fallos del proveedor no impiden reservar. Coordenadas ausentes no se sustituyen por otras.

Configuración en la API:

    WEATHER_ENABLED=true
    OPEN_METEO_API_KEY=

El prototipo no comercial puede usar el endpoint gratuito. La explotación comercial requiere contratar una licencia de Open-Meteo; con OPEN_METEO_API_KEY se utiliza automáticamente customer-api.open-meteo.com. Revisar condiciones en https://open-meteo.com/en/pricing.

## Resend

La migración docs/sql/notificaciones_reservas.sql crea preferencias_notificacion y reserva_correo_outbox, ambas con RLS y sin permisos para PUBLIC, anon o authenticated. Las operaciones pasan por la API autenticada. Se aplicó al proyecto Supabase configurado, sin insertar reservas ni generar correos históricos.

Un trigger registra altas, confirmaciones, cancelaciones y reprogramaciones en la misma transacción de la reserva. Si la operación revierte, el aviso también revierte. Un proceso cada minuto entrega hasta diez avisos, con bloqueo SKIP LOCKED, reintentos y claves de idempotencia de Resend. La aceptación por el proveedor se distingue del estado de reserva: un fallo de correo no convierte una reserva guardada en un error de reserva.

También encola un recordatorio cuando faltan entre 15 minutos y dos horas para el partido confirmado. No envía recordatorios después de comenzar. Respeta las preferencias actuales y descarta confirmaciones antiguas tras cancelaciones/reprogramaciones y avisos con más de 24 horas.

En Perfil > Notificaciones se pueden guardar avisos de reservas y recordatorios. Por defecto están habilitados como preferencia; el envío permanece desactivado hasta configurar el proveedor.

Variables privadas en la API/Render, nunca en Angular/Vercel:

    RESEND_API_KEY=valor_privado
    MAIL_FROM_EMAIL=reservas@dominio-verificado
    APP_PUBLIC_URL=https://canchero-iota.vercel.app
    BOOKING_EMAILS_ENABLED=true

Preparación:

1. Crear la cuenta en https://resend.com y verificar el dominio remitente siguiendo sus registros DNS.
2. Crear una API key con permisos de envío.
3. Configurar las variables anteriores en .env.local para pruebas o en Render para producción.
4. Reiniciar/desplegar la API y realizar una reserva de prueba controlada.
5. Comprobar la aceptación en Resend y la recepción del correo. No se ha hecho un envío real sin credenciales.

Los correos de recuperación y bloqueo de cuenta usan Resend si está configurado. Brevo continúa como alternativa para esos avisos de acceso. Sin proveedor no se escriben destinatarios, tokens o enlaces de recuperación en logs.

## Sentry

Se integra mediante SDK oficial: Angular 11.11.0 y Java 8.63.0.

- Angular: errores globales, ErrorHandler y fallos HTTP 5xx de la API. No registra contraseñas incorrectas como fallos técnicos.
- Spring MVC: errores inesperados, conservando los manejadores/respuestas existentes.
- Desactivado por defecto. El SDK web se carga de forma diferida solo al activarlo con un DSN válido.
- Proyectos separados para frontend y backend.
- Sin Replay, trazas de rendimiento ni instrumentación de formularios. El cliente desactiva la recolección de usuario, cookies, cabeceras, cuerpos, consultas URL y variables.
- Los filtros eliminan usuario, request, extras, contexto, breadcrumbs y mensajes originales; conservan tipos de error y stack técnico. Los mensajes de excepciones se sustituyen por texto neutro.

Configuración:

    SENTRY_ENABLED=true
    APP_ENVIRONMENT=development
    APP_RELEASE=revision-publica-git

En Vercel/Angular añadir SENTRY_FRONTEND_DSN. En Render/API añadir SENTRY_BACKEND_DSN. No se reutiliza la variable histórica SENTRY_DSN para evitar activar un proyecto incorrecto. El DSN web es público; las API keys privadas de correo y clima nunca se incorporan a environment.local.ts.

Crear los proyectos en https://sentry.io, copiar los DSN y activar las variables solo después de revisar la configuración. Para producción usar APP_ENVIRONMENT=production. La publicación y carga privada de source maps no está configurada por esta entrega.

## Verificación

- Pruebas de caché/fecha/hora del clima, lectura de coordenadas NUMERIC en PostgreSQL y fallos del proveedor.
- Pruebas de privacidad Sentry y exclusión de claves privadas del bundle.
- Pruebas de contrato HTTP Resend con servidor simulado, sin envíos reales.
- Pruebas PostgreSQL de rollback, idempotencia, cancelación, preferencias por cuenta, reprogramación, recordatorio y reintentos.
- Suite web: 281 pruebas correctas. Suite API previa al ajuste NUMERIC: 159 pruebas correctas; prueba de clima PostgreSQL añadida y tres pruebas específicas correctas tras el ajuste.
- API local verificada con datos reales: clima disponible y 168 horas para sede 54.

Las variables de Resend/Sentry quedan preparadas en .env.example; no se activan sin credenciales. No se publica a GitHub/Render/Vercel automáticamente.
