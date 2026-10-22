# Base de datos

## Nivel de certeza
Actualizacion posterior 2026-10-15: consulta JDBC limitada a metadatos confirma un perfil activo y rol activo para el correo indicado; password_hash clasificado como bcrypt con CASE en servidor, sin devolver su contenido. No se modifico el registro. Backend corregido para verificar ese formato, ademas de SHA-256 legacy; nuevas altas generan bcrypt coste 12. Login correcto con la clave del usuario aun pendiente de su reintento.
Actualizacion posterior 2026-10-15: bloqueo JDBC resuelto con Shared Session pooler del mismo proyecto, puerto 5432 y SSL. Configuracion privada completada sin cambiar contrasena. API reiniciada ejecuta consulta de autenticacion y devuelve 401 para identidad inexistente, sin escrituras. Supera el bloqueo DNS anterior; no certifica aun login correcto de usuario, resto del esquema ni permisos globales.
Actualizacion 2026-10-15: consultas REST limitadas confirman usuario activo con correo dueno@canchero.pe propietario de sede 54; no se le reasignaron datos. Metadatos mediante select con limit=0 confirman usuario.correo, telefono y password_hash; usuario.email no existe (400). No se leyeron hashes. Login/registro/me adaptados a correo con alias email en DTO. Spring no logra conexion JDBC remota: el host directo configurado falla por DNS; REST disponible no demuestra disponibilidad PostgreSQL desde esta red. Pendiente configurar Session pooler del mismo proyecto, sin adivinar region/credenciales.
Revision puntual 2026-10-15: consulta REST autorizada con configuracion publica existente, no MCP ni acceso administrativo. La sede 54 GRAS SINTETICO BALON DE FUEGO devolvio estado A y propietario distinto del perfil demo owner-1; consulta publica de cancha por id_sede=54 devolvio 200 con lista vacia. No permite concluir borrado/ausencia global ni certificar RLS. Sin escrituras, cambios de propietario o migraciones.
Pendiente historico: verificar sesion y cadena de propiedad con acceso de solo lectura; preservar borradores locales. El protocolo interno del equipo se distribuye por canal privado, no forma parte de los requisitos de un clon publico.

Destino acordado: Supabase en linea, PostgreSQL.
La estructura siguiente proviene del codigo y referencias SQL locales; NO es una certificacion del esquema remoto ni de sus politicas RLS.
Referencia: ../../descargas/Querry SQL Postgrest Canchero.txt. Verificar antes de ejecutar; no aplicar el archivo completo a ciegas.
Exportaciones de chat contienen esquemas historicos y no son migraciones autorizadas.

## Relaciones observadas en codigo/referencias
### Resenas: diagnostico y propuesta, no migracion aplicada (2026-10-15)
- JDBC metadata/readOnly: public.resena y public.resenas no existen (to_regclass devuelve null en ambas); no se consultaron opiniones ni datos personales. No confundir DTO/controlador existente con tabla desplegada.
- ReviewController y SupabaseDataService esperan resena con id_sede, id_cliente, id_reserva, puntuacion, comentario y auditoria. La lectura actual captura excepciones y devuelve lista vacia, ocultando una tabla ausente. No interpretar ese vacio como cero resenas verificado.
- Riesgos del alta actual: clienteId viene del cuerpo y no se contrasta con la identidad autenticada; valida que una reserva finalizo, pero no comprueba que sea del cliente ni de la sede enviada. Duplicado se controla por SELECT previo, sin restriccion remota comprobada. No habilitar el alta como flujo seguro solo por crear la tabla.
- Propuesta pendiente de acuerdo: una tabla resena por reserva finalizada, con FK a reserva y cliente, puntuacion CHECK 1..5, comentario, estado y fechas; unicidad por reserva. Derivar cancha y sede de reserva -> cancha -> sede, sin confiar en IDs arbitrarios del formulario. Mostrar la opinion en la cancha y agrupar/promediar por sede, sin duplicar registros ni crear tablas por cancha/sede.
- Si se requieren opiniones generales de sede independientes de una reserva o puntuaciones separadas para sede y cancha, confirmar ese flujo antes de fijar esquema/unicidad. No es una regla de negocio aprobada aun.
- No se creo tabla ni se aplico migracion en esta consulta. Preparar migracion versionada y validacion de autor/propiedad, concurrencia y moderacion antes de implementacion.

### Inventario comprobado 2026-10-15
- Esquema remoto inspeccionado mediante information_schema: producto no tiene id_sede ni id_dueno. Kardex tiene id_producto e id_sede; producto es actualmente un catalogo global, no inventario propio.
- Conteos de solo lectura: 960 productos activos globales; cero con Kardex activo en sede 54. No implica productos agotados ni autoriza asignarlos a esa sede.
- Correccion de contencion: listProducts(sedeId) une con el ultimo Kardex activo de ese producto en esa sede y devuelve k.id_sede real. Excluye productos sin vinculo; conserva stock cero real. Nunca proyectar sede solicitada sobre todas las filas globales ni usar coalesce(stock,0) para inventar pertenencia.
- Verificacion con el servicio Java real conectado a PostgreSQL, conexion readOnly: productos/ movimientos/ventas sede 54 = 0/0/0. Sin escrituras, reasignacion ni borrado de datos.
- Modelo pendiente: asignacion explicita de catalogo por sede, alta incluso con stock inicial cero y precios/costos propios, con migracion versionada y permisos. No crear tablas o movimientos ficticios para restaurar tarjetas anteriores; preservar borradores y confirmar procedencia.

| Entidades | Relacion o finalidad |
| --- | --- |
| usuario, rol | Cuenta y rol; usuario identificado por UUID |
| sede | id_sede, id_dueno; propiedad de la sede |
| cancha | Pertenece a sede |
| tipo_horario | id_sede, dia_semana, apertura, cierre, estado |
| tarifa_cancha | Tarifas asociadas a cancha |
| reserva, pago_reserva | Reserva y cobros relacionados |
| bloqueo_mantenimiento | Bloqueos de cancha |
| caja, sesion_caja, movimiento_caja | Turnos y movimientos |
| producto, kardex | Productos y movimientos de inventario |
| venta, venta_detalle | Venta y sus partidas |

tipo_horario usa dias 0=domingo a 6=sabado. La implementacion inicial guarda una franja por dia y sede; no satisface aun varias franjas, herencia sede/cancha ni cierres recurrentes.

## Ampliaciones requeridas, no ejecutadas por esta documentacion
- Resenas (propuesta manual 2026-10-15): SQL completo en sql/2026-10-15_crear_resena.sql, NO aplicado. id_sede/id_reserva integer e id_cliente UUID contrastados con esquema remoto. Una fila por reserva completada; cancha derivada desde reserva. Trigger verifica sede/cliente y estado Completada. API aun debe comprobar autoria de la sesion y dejar de ocultar errores; las restricciones no sustituyen autorizacion. Acceso directo anon/authenticated revocado y RLS habilitado sin politicas de navegador; acceso por backend segun sus permisos.
- Fixtures de resenas: es_sintetica=true exige estado T, fuera de consultas publicas actuales de estado A. Conteos readOnly: 300 reservas, solo 150 completadas; no insertar 400 opiniones reutilizando reservas. PROMPT_CLAUDE_RESENAS_SINTETICAS.md solicita conjunto aislado de QA, sin alterar clientes/reservas existentes ni publicar opiniones artificiales como reales. No se ha validado ejecucion del DDL ni generado datos remotos.
- Horarios individuales por cancha, configuracion comun opcional y varias franjas.
- Cierres inmediatos/programados y descansos recurrentes.
- Pagos desglosados, devoluciones parciales y trazabilidad de comisiones.
- Stock por sede y transferencias verificables.
- Vinculos de empleados con dueno/sedes y permisos en etapa posterior.

No inventar nombres finales de tablas para estas ampliaciones sin inspeccionar la base real.

## Permisos e integridad
Actualizacion 2026-10-18: metadatos remotos leidos en transaccion JDBC readOnly confirman venta sin desglose por medio; pago_reserva con id_metodo_pago e id_sesion_caja nullable, y tabla sesion_pago_resumen existente con totales por turno/medio. No se consultaron filas de negocio ni se modificaron datos. Continuacion documentada en PLAN_PERSISTENCIA_PAGOS_CAJA.md, aun propuesta, no migracion aplicada. Cierres con ventas activas bloqueados temporalmente para evitar inferir efectivo desde el total.

Validar propietario en cada lectura/escritura privada del backend.
Revisar RLS en todas las tablas accesibles directamente desde el navegador y politicas de Storage.
Nunca exponer service_role ni credenciales PostgreSQL al frontend.
Evitar reservas simultaneas incompatibles y duplicacion de cobros mediante restricciones/transacciones e idempotencia verificadas.
No confundir cancelacion de reserva con devolucion de dinero.
No borrar ventas para anularlas.

## Procedimiento de migracion
1. Leer esquema remoto y restricciones actuales con acceso autorizado.
2. Comparar con referencias locales y registrar diferencias.
3. Preparar migracion versionada, impacto sobre datos y recuperacion.
4. Probar en entorno aislado; conservar datos y referencias existentes.
5. Aplicar segun el alcance autorizado y verificar permisos e integridad.
6. Actualizar este documento con fecha y evidencia.

Credenciales solo en configuracion privada. Nunca en este archivo.
# Pagos: propuesta preparada 2026-10-19

Metadatos JDBC de solo lectura confirman que venta no guarda metodo/desglose y pago_reserva tiene id_sesion_caja. Se prepara [migracion aditiva](sql/2026-10-19_pagos_venta.sql) para venta_pago, venta_operacion y snapshots nullable de arqueo_caja. NO aplicada en Supabase; no reconstruye pagos historicos ni modifica reservas/clientes. Validacion aislada PostgreSQL WASM, no certificacion del esquema completo. Ver [guia](PAGOS_Y_CAJA.md).
Actualizacion 2026-10-19: migracion de pagos aplicada con autorizacion explicita. Verificadas dos tablas nuevas, tres snapshots nullable, FK, triggers, RLS y revocaciones de acceso navegador antes/despues del COMMIT. Sin datos sinteticos ni cambios en conteos de ventas/turnos/arqueos. No volver a ejecutar en el mismo entorno; ver [estado y limites](PAGOS_Y_CAJA.md).
