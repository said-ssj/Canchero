# Conexiones y límites de la entrega — 12 de noviembre de 2026

## Correcciones

- Configuración guarda nombre comercial, teléfono y RUC de la sede seleccionada.
  La operación se identifica como edición de sede, no como cambio del nombre
  personal del titular. Si no hay sede o el servidor rechaza, no anuncia éxito.
- La campana excluye Mercado Pago de los abonos que requieren revisión manual.
- Kardex, ventas y categorías fallidos muestran error del POS; no se presentan
  como historiales vacíos. Si la capacidad de cobro es desconocida queda cerrada.
- Las preferencias de campana de pagos manuales y stock filtran avisos reales,
  separadas por cuenta y sede. Son preferencias de este navegador, explícitamente
  etiquetadas; no se afirma sincronización entre dispositivos. Las otras fuentes
  de alertas siguen deshabilitadas hasta integrarlas.
- Se retiran la insignia fija de correo verificado, teléfono de ejemplo, horas
  y métodos de pago inventados, porcentajes de canales sin ventas y referencias
  bancarias ficticias. Mercado Pago y métodos desconocidos no se cuentan como
  tarjeta por defecto. CSV y exportaciones no afirman un porcentaje universal.
- El formulario inicial y el selector de emojis se describen en
  `PRIMER_ACCESO_Y_EMOJIS.md`.

## Comprobación remota de solo lectura

Antes del despliegue, Render y Vercel respondieron HTTP 200. Login autenticado,
perfil propio, perfil comunitario, búsqueda pública, contactos y conversaciones,
productos, Kardex, ventas y capacidades del POS de la sede autorizada respondieron
HTTP 200. Mercado Pago declaró disponible y en modo prueba.

El canje de JWT de Realtime respondió 503: faltaba su configuración en Render.
Se guardaron las dos variables del puente con autorización específica, sin
exponer secretos en Vercel o Git. Su activación requiere el siguiente despliegue
y comprobar después el canje y la suscripción privada.

No se enviaron mensajes reales ni se realizaron cobros, ventas, cierres de caja
o movimientos de inventario para comprobar estas conexiones. Un HTTP 200 no
certifica esos ciclos completos. No se cambió el esquema de Supabase.

## Alcance pendiente

- Comprobar una compra de prueba y su Webhook completo con Mercado Pago.
- Certificar en producción los ciclos de caja/stock y aislamiento entre dos
  dueños con datos controlados.
- Las devoluciones y transferencias bancarias automáticas no están integradas;
  los controles correspondientes no deben anunciar movimientos realizados.
- Las alertas de contacto, nuevas reservas confirmadas y reseñas no tienen una
  fuente persistente conectada en esta entrega.
- Matchmaking e inscripciones individuales pertenecen a la fase posterior;
  no se habilitan mediante estas correcciones de conexiones.
