# Pase de reserva y control de ingresos

## Funcionamiento implementado

1. El jugador elige cancha, horario y cantidad de personas que ingresarán. La API valida esa cantidad contra la capacidad de la cancha.
2. Mercado Pago procesa el pago. Regresar al sitio o modificar los parámetros de la URL no acredita un pago.
3. Una aprobación verificada por la API confirma la reserva y crea su pase en la misma transacción. Un Webhook repetido no duplica el pase ni el cobro registrado.
4. El jugador ve el QR en Resultado y puede volver a abrirlo desde Mi itinerario. Descargar o compartir no crea otro token.
5. Puede descargar un PDF, guardar una imagen PNG o utilizar el menú nativo para compartir el PDF. Si el navegador no admite compartir archivos, se descarga el PDF para adjuntarlo manualmente. No se envían mensajes automáticamente.
6. El personal autorizado de la sede escanea y confirma un ingreso por persona. Todas las copias del QR consumen el mismo contador. Al llegar al máximo, se rechazan nuevos ingresos.

## Datos del documento

Sede, dirección registrada, cancha, fecha completa, horario de Perú, código de reserva, importe pagado, máximo de ingresos y cupos disponibles al generarlo. Incluye el QR y las reglas de ingreso. En la integración actual identifica el modo prueba, sin cobros reales; no es un comprobante fiscal.

El PDF y la imagen contienen el mismo QR canónico público, incluso si el jugador descarga desde localhost. Los destinatarios pueden abrir el archivo sin tener una cuenta de Canchero. Leerlo y consumir un ingreso requiere personal autenticado con permiso para esa sede.

## Controles y vigencia

- El servidor conserva solo el hash del token y valida pago, reserva, sede, horario y cupos en cada lectura.
- Ventana de ingreso: desde quince minutos antes del partido hasta su final, en America/Lima. Los partidos que terminan a medianoche se validan contra el día siguiente.
- Cada confirmación usa un identificador de petición. Un reintento de esa misma petición no consume otro cupo. Siguiente persona prepara una petición nueva.
- Los bloqueos de PostgreSQL impiden superar el último cupo con lecturas simultáneas.
- Un pase agotado, vencido, cancelado o revocado deja de ofrecerse para descargar. Una copia previamente enviada también queda sujeta a la validación actual del servidor.
- Antes de cada descarga o intento de compartir, se consulta de nuevo el estado. La cantidad impresa es una captura; el contador válido siempre es el del servidor.
- Una reversión de ingreso exige permiso, motivo y auditoría. No se regeneran tokens al descargar o reenviar.

## Estado de las fases

| Fase | Estado |
| --- | --- |
| Confirmación automática de Mercado Pago y emisión única | Implementada; verificada en PostgreSQL temporal |
| QR estable y enlace público canónico | Implementada; token y contenido verificados |
| Contador de ingresos, idempotencia y concurrencia | Implementada; pruebas de capacidad y aislamiento aprobadas |
| PDF, imagen y compartir | Implementada; PDF renderizado y QR de PDF/PNG decodificado y comparado |
| Vuelta sin pagar a Convocados | Implementada; pruebas del retorno y recuperación aprobadas |
| Publicación de estas correcciones | No ejecutada: cambios locales, sin commit/push/despliegue |
| Compra completa con proveedor y entrega real de Webhook | Pendiente de una compra de prueba; las pruebas locales no sustituyen esta comprobación |

No se añadieron tablas ni migraciones para este cierre. Las reservas presenciales y la comprobación manual de transferencias mantienen su flujo independiente; no se simulan pagos de Mercado Pago para generar pases.
