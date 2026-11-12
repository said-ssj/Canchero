# Checkout: varios dias con un unico pago

Implementacion local del 12 de noviembre de 2026. Conserva Checkout Pro de prueba de Canchero. No incorpora cobros individuales de matchmaking ni activa produccion.

## Comportamiento

- El calendario agrupa los turnos por fecha y continuidad, independientemente del orden de los clics. Los huecos no seleccionados no se reservan ni cobran.
- Un pago puede incluir hasta 31 bloques y 168 horas de una misma cancha. El servidor normaliza y valida otra vez la seleccion.
- La API calcula cada importe desde sus tarifas reales. Retiene todos los bloques en una transaccion durante diez minutos. Si uno no esta disponible, revierte el conjunto antes de solicitar la preferencia.
- Mercado Pago recibe una preferencia con los bloques como items, una referencia externa raiz y el total conjunto. Angular nunca envia importes ni datos de tarjeta.
- Solo la aprobacion consultada al proveedor y validada por vendedor, importe, moneda y entorno confirma las reservas. Volver a la tienda no acredita el pago: recupera todos los bloques en Convocados mientras la retencion siga vigente.
- Cada bloque mantiene su reserva y QR independientes, con los cupos indicados para ese bloque. Compartir un pase no aumenta sus usos ni habilita los de otra fecha. El resultado permite elegir cada pase y descargar/compartir el documento existente.
- La expiracion libera el conjunto. Un pago tardio o una reserva invalidada requiere revision; no resucita horarios. Los avisos de reembolso o contracargo revocan los pases del conjunto. No se ejecutan transferencias ni reembolsos desde esta entrega.

## Estructura y compatibilidad

Migracion `20261112100000_checkout_multibloque.sql`: agrega `mp_checkout.id_checkout_padre` UUID, FK a la misma tabla, comprobacion de padre distinto e indice. Aplicada al proyecto Supabase existente el 12 de noviembre de 2026, con verificacion de columna, FK, indice, RLS y permisos. No crea tablas ni registros de reservas/pagos. Conserva RLS y permisos cerrados al navegador.

La raiz contiene el importe completo del cobro; las reservas contienen sus importes individuales. `State.monto` representa la reserva seleccionada, `totalOperacion` el cobro completo y `bloques` enumera las reservas incluidas. Cada fila sigue teniendo su propio `reserva_acceso`, por lo que el escaner existente conserva autorizacion por sede, limites, horario e idempotencia.

Las solicitudes antiguas `fecha`/`hours` siguen admitidas como un bloque. Las nuevas pueden enviar `selections: [{fecha,hours}]`. Para varios bloques se omiten los campos legacy, de modo que una API antigua rechace el conjunto en lugar de reservar y cobrar solo el primer dia durante un despliegue escalonado. Si falta la columna, la API actualizada no habilita pagos. Aplicar la migracion antes de desplegar API y frontend juntos.

## Resumen de seleccion

El cuerpo de ambos resumenes se aloja dentro de `.summary-scroll`. En escritorio, la tarjeta sticky limita su altura a la ventana, contiene el desborde y mantiene el boton fuera del area que desplaza. En movil vuelve al flujo normal. El contenido no puede extenderse sobre el footer.

## Verificacion

- Suite web completa: 396 pruebas aprobadas, 59 archivos. Incluye varios dias, huecos, envio en una operacion, recuperacion de todos los bloques y seleccion de pases.
- Build web de produccion correcto. Advertencias previas: bundle inicial de 1.29 MB y modulo CommonJS jsqr.
- PostgreSQL desechable: 29 pruebas aprobadas, sin errores ni omisiones; agrupacion, suma, atomicidad, aislamiento, reintentos, expiracion, reembolso, cupos independientes y dos usuarios simultaneos. Se verifica tambien que una alteracion del importe de una reserva no confirme un conjunto insuficientemente pagado. Resultado final: 29/29 correctas (MercadoPagoPostgresTest).
- Regresion de reservas: 33 pruebas aprobadas (persistencia/concurrencia, autorizacion y correo). Los candados locales de cancha ahora se liberan al terminar la transaccion JDBC, evitando interbloqueos al crear varios bloques.
- No se han creado pagos ni reservas de prueba en Supabase, ni se ha usado una tarjeta real. Falta validar el flujo de prueba completo del proveedor tras publicar.
- No se certifica una revision visual en navegador: el servidor de desarrollo no estaba disponible. Una revision automatica anterior rechazo iniciarlo; no se intento eludir esa restriccion.
- La publicacion en GitHub no certifica que Render y Vercel hayan desplegado correctamente; verificar sus resultados y la prueba completa del proveedor.

## Mercado Pago Integration Review

**Scope**: security. **API detected**: Preferences API de Checkout Pro; GET Payments para verificar estado.

Seguridad revisada localmente: secretos desde variables privadas; archivos privados ignorados; Webhooks HMAC y bandeja idempotente conservados; URLs HTTPS; estado consultado en servidor; referencia externa raiz; entorno de prueba verificado; init_point validado. No se crea un pago con POST Payments/Orders: la idempotencia se aplica a las retenciones y conciliacion; los reintentos de preferencia reutilizan el primer enlace persistido. No se declara evaluacion oficial ni homologacion.

El detector del plugin no reconoce el CTA Angular y devuelve not_found. La inspeccion manual identifica el boton existente `confirmarReserva()` de checkout.html; se conserva y marca `data-mp-checkout-cta="checkout-pro"`. No se crea una segunda pantalla de tarjetas.

## Implementation Report

### Verified
- [x] Un total calculado en servidor y una preferencia para todos los bloques.
- [x] Transacciones, permisos por cuenta y confirmacion del proveedor conservados.
- [x] QR y documentos por bloque, sin cambiar el limite de usos al compartir.
- [x] Sin secretos en frontend ni nuevos datos ficticios.

### Needs attention
- [ ] Publicar API y frontend y realizar una compra de prueba completa.
- [ ] Verificar visualmente al 100% y en movil, con varios dias y el footer visible.
- [ ] Homologacion no solicitada ni presentada; credenciales de produccion no activadas.

### Blockers (must fix before production)
- [ ] El servicio permanece exclusivamente en modo prueba. No se certifica operacion con cobros reales.

### Next steps
1. Publicar los cambios cuando el usuario lo solicite.
2. Probar retorno sin pago, aprobacion y escaneo de cada pase con cuentas de prueba.
3. Repetir mp-review antes de habilitar produccion.

### Resources used
- Local: codigo, checklist de seguridad y pruebas PostgreSQL/web.
- Skills: mercadopago:mp-integrate, mercadopago:mp-review; Supabase/Postgres y canchero-ui.
- MCP: no se solicito evaluacion oficial ni se hicieron operaciones de cuenta.

**Scores**: official quality: N/A. **Verdict**: pruebas locales aprobadas; produccion y prueba completa del proveedor pendientes.
