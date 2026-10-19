# Fichas textuales de pantallas

Objetivo visual sin necesidad de capturas. Son criterios de construccion, no afirmacion de que las pantallas actuales ya los cumplan.
Tema obligatorio: Plus Jakarta Sans, Material Symbols Outlined, verde #3CB043, naranja #F5821F, negro/grises, blanco; radio habitual 6px y maximo 8px.
Sin efectos hover, botones compactos, cursor pointer solo en controles reales habilitados.
Todas las zonas asincronas incluyen skeleton estatico, vacio y error. Las medidas siguientes son referencias, no alturas que recorten contenido.

| Pantalla | Distribucion y acciones |
| --- | --- |
| Inicio / index | Navegacion superior, marca Canchero visible, mensaje principal y acceso real a Sedes; bloques informativos y pie sencillos. Funciones pendientes grises e inactivas. |
| Sedes | Busqueda y filtros sobre listado de sedes; imagen, nombre, ubicacion, precio real y acceso a detalle. No inventar rating ni precio si falta informacion. |
| Detalle | Fotografias, informacion de sede/canchas y disponibilidad; seleccionar cancha y bloque horario. Fotos con proporcion estable y alternativa si fallan. |
| Checkout | Resumen del bloque y precio, tarjeta simulada online al 100%; estados de envio/aprobacion/error. Sin Yape/Plin online. |
| Itinerario | Reservas del jugador con fecha, cancha, bloque, estado y pagos claramente separados. |
| Login/registro | Formulario compacto con labels y errores; cuentas reales, sin bypass por correo ni entradas demo automaticas. |
| Admin general | Sidebar oscuro, toolbar compacta, selector de sede y campana; contenido claro adaptable. No repetir marco de pagina dentro de marcos decorativos. |
| Mis Sedes | Tarjeta horizontal compacta: foto izquierda de referencia 200px y datos derecha; altura minima de referencia 160px, crece si hace falta. Horarios, Ver Canchas y Editar. Accion Agregar separada. En movil adaptar columnas sin desbordar. |
| Mis Canchas | Resumen compacto y tarjetas por cancha, foto proporcionada, nombre, atributos, tarifas y acciones reales. Formulario por secciones, etiquetas en columnas cuando convenga. |
| Reservas admin | Filtros y tabla operativa; crear reserva presencial, revisar afectadas por cierres, reprogramar/cancelar segun permisos. |
| Horarios/cierres | Configuracion por cancha o comun por sede; dias, franjas, tarifa nocturna y cierres. Indicar reservas afectadas antes de resolverlas. |
| Caja | Apertura, turno, movimientos, arqueo e historial; separar efectivo de digital. Estado de caja visible, sin acciones duplicadas. |
| POS | Catalogo y filtros/favoritos a un lado, carrito al otro; apilar en movil. Stock y vuelto legibles. Alerta breve y detalles en campana. Comprobante en overlay, sin desplazar el catalogo. |
| Finanzas | Alquileres cobrados, devoluciones, comisiones y neto; no presentar transferencias ni PDFs inexistentes como realizados. |
| Personalizacion/QR | Campos y controles de color con preview fiel; QR real escaneable. Textarea solo redimensionable verticalmente. |
| Configuracion | Secciones sin tarjetas anidadas; cuenta, seguridad y preferencias. Acciones incompletas deshabilitadas, no mensajes falsos de exito. |
| Errores | Codigo cuando corresponda, titulo breve, explicacion y accion real. Sin decoraciones ni opciones de pago inventadas para 402. |

## Controles comunes
- Boton habitual 36-44px visuales con area tactil suficiente. Nunca agrandarlo para llenar espacio.
- Inputs con label y un solo borde. No reemplazar labels por placeholders.
- Estados de efectivo acordados: insuficiente rojo, exacto verde, excedente celeste, siempre con texto y monto.
- Badge de cantidad muestra numero, no punto.
- Tarjeta sin accion propia no muestra manito ni funciona como boton.
- Avatares y muestras de color pueden ser circulares; acciones no usan pastillas por defecto.
- Foco de teclado visible y tooltips funcionales se mantienen aunque no haya hover visual.
