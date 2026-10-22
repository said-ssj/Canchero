# Sistema de diseno de Canchero en Figma

Actualizacion 2026-10-16: el usuario autorizo continuar modelos en HTML/CSS local a partir de nueve PNG exportados. Fuente de continuacion: [SISTEMA_DISENO_HTML_CSS.md](SISTEMA_DISENO_HTML_CSS.md). Paquete: C:\Users\alvar\Downloads\Canchero - Sistema de diseno\prototipo-html-css. Figma se conserva, no se sobrescribio ni se sincroniza automaticamente. Las propuestas Sedes/checkout/Itinerario nuevas estan en HTML, no son frames creados en Figma.

Revision: 2026-10-15. Biblioteca ampliada: 39 familias, 175 variantes, 41 variables, cinco estilos y 26 iconos Google. NO instalada en Angular. Ver limites de verificacion y ledger de nodos.

- Archivo editable: https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy
- Muestras: https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=3-143
- Pagina: 01 - Biblioteca Canchero.
- Los componentes maestros estan a la derecha del panel de muestras. El panel utiliza instancias, no copias desprendidas.
- La conexion Figma esta confirmada; el archivo esta creado en borradores. No se publico como biblioteca de equipo.

## Continuacion: modelos operativos y Configuracion

El usuario autorizo retomar Figma el 2026-10-15 e incluir Configuracion solo si faltaba. Inventario MCP previo confirmo las 22 familias/116 variantes anteriores y ausencia de modelos de Configuracion. Se conservaron maestros y tokens, sin duplicar familias.

Agregadas 17 familias y 59 variantes; total comprobado por auditoria MCP: 39/175, sin nombres de set duplicados. Seis iconos adicionales proceden de SVG oficiales Google Material Design Icons Outlined: settings, qr_code, palette, stadium, account_balance y receipt. No se agrego otro kit visual.

| Familia | Variantes | Maestro |
| --- | --- | --- |
| TableHeader | 2 | 32:1029 |
| TableRow | 4 | 32:1074 |
| Paginator | 3 | 32:1114 |
| FilterBar | 2: escritorio/movil | 32:1145 |
| Dialog | 3: confirmacion/cancelacion/formulario | 32:1204 |
| Drawer | 3: detalle/horario/error | 32:1270 |
| AppHeader | 2 | 32:1291 |
| Sidebar | 2: ampliado/compacto | 32:1398 |
| UserMenu | 1 | 32:1413 |
| PageState | 13: vacio, offline, 400, 401, 402, 403, 404, 409, 422, 429, servidor, sin inventario, carga | 32:1473 |
| WeekHours | 3 | 32:1528 |
| ReservationBlock | 4 | 32:1546 |
| Cart | 3 | 32:1575 |
| SplitPayment | 3 | 32:1633 |
| CashShift | 3 | 32:1672 |
| SettingsSection | 5: cuenta/seguridad/notificaciones/comision/adelantos | 32:1756 |
| NotificationPanel | 3 | 32:1781 |

### Composiciones editables
- [Configuracion escritorio](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=32-1782): 1440 x 1196.
- [Configuracion movil](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=32-1959): 390 x 1884.
- [Reservas escritorio](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=34-2232): 1180 x 654, tabla continua.
- [Reservas movil](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=34-2293): 390 x 772, filtros apilados y bloques.
- [Tablas y ventanas](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=32-2052).
- [Navegacion y estados](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=34-2180).
- [Patrones operativos y ajustes](https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=34-2182).

Configuracion reutiliza los maestros de formularios/botones, sin cuentas reales ni datos privados. Incluye datos del titular, claves, campana, adelanto comun por sede y comision del dueno; acciones pendientes grises. Muestras monetarias son ilustrativas, no registros. Estado 402 es condicional a un contrato real, no introduce una deuda o bloqueo comercial nuevo.

### Verificacion y limites
- Auditados los siete frames: 1144 descendientes editables entre textos, marcos, instancias y vectores; sin raster de UI ni texto fuera de los marcos. Fuente Plus Jakarta Sans comprobada, sin discrepancias.
- Capturas revisadas de Configuracion y Reservas desktop/movil y las tres hojas de componentes. Corregidos auto-layout horizontal, contraste/posicion del sidebar, botones estirados, mensajes de error y estados 401/429.
- Ultimos retoques posteriores: iconos semanticos, tabla continua y ortografia. Auditoria estructural posterior aprobada. La ultima captura posterior a estos retoques fue rechazada por cuota MCP Starter; no se cambio plan ni se intentaron mas llamadas. Falta esa captura final y sigue pendiente revisar visualmente el antiguo panel POS/Finanzas 14:1021.
- Capturas locales disponibles en carpeta del chat: canchero-figma-desktop-final.png, mobile-final.png, tables-final.png, states-final.png, patterns-final.png y reservas-desktop-final.png / reservas-mobile-final.png. Algunas anteceden los ultimos retoques; no tratarlas como capturas actualizadas automaticamente.
- Ledger persistido: [ESTADO_BIBLIOTECA_2026-10-15.json](figma/ESTADO_BIBLIOTECA_2026-10-15.json), con IDs, inventario y alcance de QA. El script temporal de construccion fue retirado despues de usarlo; no reejecutar scripts de creacion para inspeccionar.
- Sin cambios funcionales en Angular, Spring Boot o base de datos. Sin Code Connect publicado ni sincronizacion automatica. Figma no implementa persistencia, permisos ni los flujos que representa.

### Siguiente revision
Prioridad solicitada el 2026-10-15: agregar redisenos completos de Sedes publicas, seleccion de horarios/checkout e Itinerario del jugador en escritorio y movil. Solo registrados como pendientes; no hay nuevos frames ni cambios de interfaz en esta entrega.

- La captura de calendario corresponde a features/jugador/checkout, no al componente itinerario. Disenar ambos como partes del recorrido Sedes -> cancha concreta -> horarios/pago -> Mi Itinerario.
- Sedes: catalogo y filtros limpios, fotografias proporcionadas con carga/error, acciones explicitas por cancha. Reutilizar VenueCard/CourtCard existentes; no confundir tarjetas maestras con pagina publica completa terminada.
- Checkout: cabecera compacta con sede/cancha/formato informativos y contexto heredado mediante ID real. Sin selectores redundantes de sede/tipo. Contexto ausente/invalido muestra error y regreso a elegir cancha, nunca primera cancha por defecto.
- Calendario: cero horas seleccionadas inicialmente, disponibilidad real por cancha, estados libre/seleccionado/ocupado/cerrado/pasado/cargando/error distinguibles. No generar ocupacion mediante formulas. Seleccion es distinta de retencion y confirmacion.
- Resumen: horas consecutivas como bloque unico; precio por tramo y total verificados en servidor. Continuar deshabilitado sin seleccion valida. No mostrar jugadores, pagos o cupones ficticios.
- Retencion: contador solo cuando servidor confirme bloqueo con vencimiento; plazo y momento de inicio por definir. No reutilizar automaticamente 15 minutos del flujo Yape/Plin aplazado.
- Sin hover visual, brillos, elevacion ni animaciones; conservar seleccion y foco de teclado. Botones compactos, bordes 6-8px, Plus Jakarta Sans, Google Material, pendientes grises y disabled real.
- Itinerario: solo reservas del cliente autenticado; bloque, fecha, cancha, sede, pago/saldo y estado reales. Sin buscar primer cliente como fallback. Estados vacio, skeleton estatico, error, offline y conflicto de horario.
- Verificar desktop/movil: no tarjetas anidadas decorativas ni scroll de toda la pagina; calendario semanal con scroll acotado o vista diaria movil. Acciones y resumen accesibles sin botones gigantes.

Completar captura post-retoques y antigua hoja POS/Finanzas cuando vuelva la cuota. Ampliar despues ejemplos completos de caja/POS y configuracion en estados de carga/error, navegacion con selector abierto/sin sedes y accesibilidad/prototipos. Los componentes base anteriores ya existen: no recrearlos.

## Inventario inicial conservado

41 variables, cinco estilos tipograficos, 11 familias con 46 variantes y siete iconos Google Material outlined.

| Familia | Variantes | Correspondencia en Angular |
| --- | --- | --- |
| Button | 12: Primary/Secondary/Danger por Default/Focus/Disabled/Loading | mat-flat-button o mat-stroked-button; disabled real; bloqueo de envio |
| Field | 5: Empty/Filled/Focus/Error/Disabled | mat-form-field outline + matInput; label y mat-error/mat-hint |
| Search | 2 | Campo de busqueda con mat-icon search |
| Tab | 3 | mat-button-toggle-group o mat-tab-group segun semantica |
| NavItem | 3 | routerLink / routerLinkActive; destino real o control deshabilitado |
| Checkbox | 4: Off/On/DisabledOff/DisabledOn | mat-checkbox |
| Switch | 4 | mat-slide-toggle |
| Alert | 4: Info/Success/Warning/Error | Region role status/alert; exito solo tras confirmacion |
| Status | 4 | Etiqueta informativa; no boton |
| Progress | 2 | mat-progress-bar con valor real |
| Skeleton | 3: Text/Field/Thumbnail | Bloques CSS estaticos; aria-busy en region, formas aria-hidden |

Iconos: search, add, close, menu, notifications, check y error.
Search procede del kit Material 3; los otros usan SVG oficiales de Google Material Design Icons.
En la aplicacion se conservan los iconos Google existentes mediante mat-icon/Material Symbols Outlined; no agregar otra biblioteca.

## Ampliacion: formularios y tarjetas

Se conservaron los componentes anteriores y se agregaron 11 familias: seis de formulario, cuatro tarjetas y una dependencia IconButton.
Conteo acumulado segun las respuestas de creacion: 22 familias y 116 variantes; se mantienen 41 variables y cinco estilos, con 20 iconos Google. El recuento global independiente final quedo bloqueado por cuota MCP.

Paneles editables:
- Formularios: https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=11-418
- Sedes y canchas: https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=13-806
- POS y Finanzas: https://www.figma.com/design/2WrLh0YQkXgzoKIDExBTCy?node-id=14-1021

| Familia nueva | Variantes | Contrato visual / Angular |
| --- | --- | --- |
| Select | 6: Empty/Filled/Focus/Error/Disabled/Open | mat-select, opciones de sedes propias; lista abierta de ejemplo |
| Date | 6 | mat-datepicker; calendario de octubre 2026 con seleccion de muestra, no disponibilidad real |
| Time | 6 | Input/selector horario accesible; opciones deben venir de disponibilidad real, sin imponer una regla nueva de intervalos |
| Textarea | 5: Empty/Filled/Focus/Error/Disabled | matInput, contador, ancho contenido y resize vertical |
| Password | 4: Hidden/Visible/Error/Disabled | Mostrar/ocultar con nombre accesible y foco; nunca credenciales reales en ejemplos |
| PhotoUpload | 5: Empty/Selected/Uploading/Error/Disabled | Solo boton + abre file input; recuadro gris no clicable. Preview no equivale a guardado |
| IconButton | 2: Default/Disabled | Dependencia con INSTANCE_SWAP de icono; area 40px, aria-label/tooltip al implementar |
| VenueCard | 6: Desktop/Mobile por Ready/Loading/Error | Foto 200px escritorio / 88px movil, borde unico, acciones separadas |
| CourtCard | 8: Desktop/Mobile por Available/Maintenance/Loading/Error | Atributos legibles, tarifa dia/noche, pendiente de horarios individuales gris |
| ProductCard | 6: Available/LowStock/OutOfStock/NoTurn/Loading/Error | Favorito separado; solo Agregar modifica carrito. Agotado y sin turno: Agregar deshabilitado |
| FinancialSummary | 16: Gross/Commission/Net/Refunds por Data/Empty/Loading/Error | Importes solo desde cobros reales al implementar; vacio con guion, no saldo inventado |

- Setenta variantes nuevas. Propiedades de texto editables, instancias de botones/iconos y variables compartidas.
- Tarjetas de sede de referencia: 1180 x 170px escritorio y 368 x 224px movil; cancha normal 1180 x 186px y 368 x 212px. Son ejemplos de composicion, no anchos minimos impuestos a la web.
- POS usa inventory_2 de Google como el componente actual; no se invento una fotografia de producto.
- La fotografia usada en tarjetas/upload es una referencia publica que ya figura como fallback en el codigo de sede (Unsplash photo-1574629810360-7efbbe195018); no se obtuvo de registros privados ni se presenta como foto real del complejo.
- Validacion visual realizada sobre capturas de Formularios y Sedes/Canchas. La creacion de POS/Finanzas fue confirmada por la herramienta, pero su captura y auditoria global final quedaron bloqueadas por el limite MCP del plan Starter. Cuenta/plan comprobados con whoami; no se cambio plan ni se eludio el limite.
- La biblioteca Figma no implementa interacciones reales de Angular ni persistencia. Botones habilitados en un modelo representan el estado previsto, no certifican un endpoint existente.

## Escala visual

- Plus Jakarta Sans: titulo 26/34 Bold, seccion 18/26 Bold, cuerpo 14/22 Regular, label 14/20 SemiBold y caption 12/18 Regular. Espaciado de letras cero.
- Identidad: verde #3CB043, naranja #F5821F, blanco y tinta #1A1A1A.
- Primario propuesto: #27802D, verde oscuro ya presente en el codigo, para mejorar contraste con texto blanco. No se cambio la paleta de la web.
- Superficies neutrales y estados semanticos vinculados a variables. Sin degradados ni sombras decorativas.
- Radios: controles 6px, superficies 8px. Altura de boton 40px, campo 44px e icono 20px.
- Espacios: 4, 8, 12, 16, 24 y 32px.
- Variables primitivas y alias semanticos con scopes especificos y sintaxis WEB propuesta var(--can-...). Esa sintaxis todavia NO existe como tema instalado.

## Como llevarlo al codigo sin romperlo

1. Revisar/aprobar la biblioteca visual antes de modificar todas las pantallas.
2. Leer las reglas originales, PROTOCOLO_AGENTES_Y_MCP y el estado vigente.
3. Traducir tokens a la fuente del tema existente, no crear otra capa global de overrides.
4. Revisar discrepancias: tema.css aun contiene fuentes Inter/Outfit y radios legacy; otras hojas fijan Plus Jakarta Sans. Esta biblioteca sigue la regla acordada, no copia esa inconsistencia.
5. Usar las APIs de tema/overrides compatibles con la version instalada de Material y mantener sus controles/accesibilidad. No exportar botones como imagenes ni pegar codigo React generado.
6. Aplicar primero a una pantalla representativa y probar componentes, overlays, escritorio y movil.
7. Conservar handlers, validaciones, propiedad y contratos. El diseno no implementa pagos, inventario o persistencia.
8. Pendientes: gris + disabled real + cursor default; sin hover ni click/teclado funcional. Foco y seleccion SI son estados funcionales y deben conservarse.
9. Probar click, Enter/Space, error y carga, ademas de build/tests. Actualizar ESTADO_ACTUAL con alcance real.

No hay sincronizacion bidireccional automatica ni Code Connect publicado. La tabla anterior es el mapa de implementacion inicial.
Un prototipo Figma no certifica que un control tenga funcionalidad en Angular.

## Pendientes acordados para retomar

### Acceso de Antigravity mientras hay cuota agotada

- Se puede configurar la conexion aunque este bloqueada la lectura por cuota. Usar Figma Dev Mode MCP oficial desde la configuracion de servidores MCP de Antigravity y autorizar la cuenta correcta.
- Servidor remoto oficial: https://mcp.figma.com/mcp . La conexion de Figma en esta conversacion no conecta automaticamente Antigravity.
- Cambiar de cliente no debe tratarse como reinicio de cuota. El bloqueo observado fue limite de herramientas MCP Starter; no se comprobo saldo de creditos de IA ni fecha exacta de renovacion.
- Ver documentacion oficial vigente: https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/ y https://www.antigravity.google/docs/mcp .
- Antes de acceder, comprobar cuenta/permisos y un nodo concreto, sin leer todo el archivo repetidamente. Si hay limite, parar llamadas y comunicarlo; no cambiar plan ni eludir cuotas.
- Las capturas existentes canchero-figma-v1.png, canchero-figma-formularios.png y canchero-figma-tarjetas.png estan en C:/Users/alvar/Documents/Codex/2026-10-10/en . Pueden adjuntarse a Antigravity con este documento. Son referencias estaticas, no reemplazan variables/propiedades MCP. Falta captura POS/Finanzas.
- Encargo inicial: leer AGENTS y este documento, comprobar MCP, inspeccionar un componente con sus variables/estados y devolver correspondencia con Angular Material. No editar Figma, Angular ni desplegar hasta que se autorice implementacion.

### Trabajo de diseno pendiente

Historico 2026-10-15: el usuario pauso Figma por cuota y posteriormente autorizo esta continuacion. La ampliacion de modelos base anterior ya se creo; no repetir la lista siguiente como si no existiera. La cuota volvio a agotarse en la ultima captura, por lo que nuevas llamadas quedan pendientes, sin cambiar el plan.

1. Revisar visualmente POS/Finanzas ya creados y completar auditoria del conjunto; no recrearlos.
2. Tablas: encabezados, filas, acciones, filtros y paginacion.
3. Ventanas: confirmaciones, formularios y paneles laterales, con foco y cierre accesibles.
4. Navegacion completa: cabecera, sidebar, selector de sede y menu de usuario.
5. Estados especificos: vacio, sin conexion, acceso denegado, errores y skeletons por contexto.
6. Patrones de negocio: horarios semanales, bloques de reserva, carrito, pagos combinados y apertura/cierre de caja.
7. Ejemplos de composicion de los componentes en escritorio y movil.

Conservar maestros, variantes y tokens existentes. Esta lista es backlog de diseno, no implementacion terminada ni autorizacion para crear logica de negocio nueva.
La integracion en Angular sigue pendiente de revision/aprobacion y verificacion, sin cambios funcionales por esta pausa.

## Evidencia de la biblioteca inicial

- Componentes con variantes, propiedades editables de texto/visibilidad, auto-layout y vinculaciones de color, bordes, espacios y radios.
- Inspeccionados los 41 scopes y los cinco estilos; sin ALL_SCOPES ni texto fuera del panel de muestras.
- Captura final revisada. Se corrigieron etiquetas compartidas de muestras y rutas transparentes de SVG que tapaban iconos.
- Se conservaron los maestros fuera del panel final. No se modifico el frontend ni se conecto la base de datos.
- Aun no incluye todas las pantallas, tablas, dialogos ni patrones de negocio completos. Las cuatro tarjetas y los seis formularios pedidos se agregaron en la ampliacion; no declarar que la biblioteca cubre toda la aplicacion.
