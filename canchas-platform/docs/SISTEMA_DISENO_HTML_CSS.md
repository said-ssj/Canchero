# Sistema visual local HTML/CSS de Canchero

Revision: 2026-10-16, America/Lima. Direccion de trabajo autorizada por usuario tras bloqueo MCP de Figma. No sustituye Angular ni su logica; es referencia visual editable offline para revision y adaptacion posterior.

## Ubicaciones

- Exportaciones originales: C:\Users\alvar\Downloads\Canchero - Sistema de diseno\Canchero
- Paquete: C:\Users\alvar\Downloads\Canchero - Sistema de diseno\prototipo-html-css
- Biblioteca: index.html dentro del paquete.
- Recorrido publico: sedes.html -> detalle.html -> checkout.html; pago.html es solo muestra visual con accion disabled.
- Proximas/historial: itinerario.html.
- Peticion de integracion: PETICION_ANTIGRAVITY.md dentro del paquete.
- Respaldo: C:\Users\alvar\Downloads\Canchero - Sistema de diseno\Canchero-prototipo-html-css-2026-10-16.zip

Abrir los HTML directamente; no requiere servidor ni instalacion de dependencias para visualizarlos. El paquete vive fuera del repositorio y no se incluye automaticamente en GitHub. Respaldarlo y entregarlo junto a la peticion cuando se trabaje en otra maquina. No asumir que otro agente puede acceder a Downloads desde otro entorno.

## Alcance real

Continuacion operativa 2026-10-16: total vigente 30 HTML. Caja/POS/Finanzas/Personalizacion en caja.html, pos.html, finanzas.html y personalizacion.html; fuente src/operacion.mjs, css/operacion.css, js/operacion.js. Leer PROPUESTAS_OPERACION.md del paquete para limites. Arqueo/carrito/pago combinado/preview son locales, sin persistir ni procesar dinero; acciones reales disabled. QR de muestra fijo no valido. Nuevos modelos pendientes de revision; historial de turnos/comprobantes/devolucion POS detallada aun pendientes. Registro de verificacion en ESTADO_ACTUAL.md; ninguna integracion Angular ni cambios BD.

Continuacion gestion 2026-10-16: seis propuestas nuevas (admin-sedes/editar-sede/admin-canchas/editar-cancha/horarios/cierres), total 26 HTML. src/gestion.mjs, css/gestion.css, js/gestion.js; shell admin propio responsive/colapsable, galerias locales, preview y franjas/cierres solo visuales. Mapa/campana/selector sede/operaciones de negocio disabled; reservas afectadas fixture fijo, no calculadas. 78 vistas/3932 aserciones sin errores; extra 320px y capturas inspeccionadas. Documentacion PROPUESTAS_GESTION.md en Downloads; pendiente revision/integracion. Caja/POS/Finanzas/Personalizacion completas aun no hechas.

Continuacion propuestas 02-05, 2026-10-16: login.html, registro.html, confirmacion.html y pase.html, con fuente src/jugador.mjs y estilos css/jugador.css. Total actual 20 HTML; 60 vistas/2540 aserciones sin errores, extra de 320px y QR decodificado. Selector Estado de muestra exclusivo de maqueta, sin autenticar ni confirmar nada. Pase marcado no valido y QR sin token/URL real, descarga offline comprobada. Fuente de detalle PROPUESTAS_JUGADOR.md del paquete. Inicio recibio conformidad visual del usuario; las otras propuestas siguen para revision. No se modifico aplicacion ni datos.

Continuacion 2026-10-16, una pagina por entrega: propuesta 01 Inicio en inicio.html, plantilla src/inicio.mjs y estilos exclusivos css/inicio.css; documento PROPUESTA_INICIO.md en paquete. Total actual 16 HTML. Busca/formato navegan al catalogo con filtro local; no consulta BD. 48 vistas/1779 aserciones sin errores y capturas revisadas de Inicio desktop/movil; comprobacion extra a 320x568 de siguiente seccion visible y sin overflow. Pendiente aprobacion de esta propuesta antes de siguiente pagina; ninguna integracion Angular. El inventario inicial siguiente conserva historia.

El equipo mantiene un inventario privado de cobertura por ruta y ventanas faltantes, disponible solo en su entorno de diseno. Distinguir paginas propuestas, piezas de biblioteca y flujos aun no modelados; no considerar las 15 paginas HTML como 15 paginas de producto completas.

Se recibieron nueve PNG y se inspeccionaron visualmente. Desktop.png/Mobile.png corresponden a Reservas, no Configuracion. Copias originales sin modificar en assets/references; no se usan capturas completas como interfaz. No hubo acceso nuevo a Figma, nodos ni medidas exactas: reconstruccion interpretada, no exportacion automatica ni garantia pixel-perfect.

Quince HTML: biblioteca, formularios, tarjetas, productos/finanzas, tablas/ventanas, estados/navegacion, patrones, reservas admin, referencias; y seis propuestas nuevas: sedes, detalle, checkout, pago, itinerario y configuracion. Componentes responden a desktop/tablet/movil. Incluyen partes de caja/POS/finanzas/personalizacion, pero esas paginas admin completas no se han redisenado; Inicio y acceso tambien quedan fuera de esta entrega.

## Archivos del paquete

- css/tokens.css: tipografia local Plus Jakarta Sans, paleta, espacios y radios.
- css/base.css: estructura general y shell de prototipo.
- css/components.css: biblioteca de controles y tarjetas.
- css/pages.css: layouts propios de pagina.
- js/interactions.js: estado visual en memoria, sin red ni localStorage.
- src/components.mjs, library.mjs, public.mjs, build.mjs: fuentes de plantillas legibles; generan HTML final y MANIFIESTO.json.
- assets/fonts: fuentes/iconos Google con licencias; assets/images contiene fotografia referencial.
- qa/verificar.mjs y RESULTADOS.json: evidencia reproducible; qa/screenshots contiene capturas 1440/390.

Se mantuvieron tokens base acordados y verde primario oscuro #25832A de referencia para contraste. Fotos ilustrativas no pertenecen a las sedes mostradas. Fixture no valida precios/disponibilidad ni identidad; no copiarlo a produccion.

## Interacciones comprobadas y limites

Menu movil; enlaces locales; dialog/drawer con Escape y retorno de foco; tabs proximas/historial/vacio; filtros/busqueda locales; contador textarea y resize vertical; visibilidad de contrasena; seleccion de fotografia en memoria; calendario inicialmente vacio, agrupacion local contigua, aviso de huecos, total de ejemplo por tramos y limpieza. Vista diaria movil sobre las mismas celdas; cambiar dia limpia la seleccion de la maqueta.

Guardar, reservar, cobrar, reprogramar, sesiones, favoritos persistidos y operaciones sin contrato estan disabled/gris. Navegar al modelo de pago no paga ni confirma. Sin retencion ni temporizador. Indicador visible aclara datos ilustrativos y ausencia de Supabase.

La primera ejecucion Playwright fallo por binario Chromium ausente; verificador ajustado a Microsoft Edge instalado, sin instalar navegador ni tocar la app. Prueba final: 45 combinaciones de pagina/viewport (15 x 3), 1576 aserciones satisfactorias y cero errores; 30 capturas. Incluye fuentes/imagenes/enlaces, no overflow de pagina, ninguna peticion HTTP externa durante navegacion, seleccion/gaps, dialog y foco, filtros, upload local y vista diaria. Algunas pruebas son por fila/enlace: el numero no equivale a 1576 escenarios de negocio.

Capturas inspeccionadas: biblioteca desktop, Sedes desktop, checkout desktop y movil, Itinerario movil, formularios movil, Reservas desktop y Configuracion movil. Ajustados calendario diario y hamburguesa solo movil. No prueba Angular/servidor/BD ni certifica accesibilidad completa. No se ejecuto build/test de la aplicacion porque esta entrega no la modifica.

## Integracion

Seguir PETICION_ANTIGRAVITY.md: una pagina por entrega y aprobacion de propuestas antes de activar reemplazos grandes; empezar por Sedes mientras otro agente estabiliza reservas. Preservar contratos, autoria, aislamiento y fases ya hechas. Mapear controles a Material y compartir tema existente. No copiar JS imperativo, datos de muestra ni base.css globalmente sobre Angular. No deshabilitar operaciones reales por imitar los disabled de una maqueta sin backend.

Figma se conserva como referencia historica en SISTEMA_DISENO_FIGMA.md; no hay sincronizacion automatica en ninguna direccion. Las propuestas nuevas aun requieren revision del usuario.
