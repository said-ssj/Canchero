# Verificacion
Actualizacion 2026-10-18: correcciones de auditoria verificadas con259pruebas frontend/25suites,101backend/16suites, build y typecheck de app/spec. Prueba negativa aislada de tipos devuelveTS2322/codigo2. Nuevas regresiones: POSTresena401/403/409/500 sin exito local, carga fallida distinta de vacio con reintento, dobleenvio/cambio de usuario, reserva obligatoria sin escrituras, y cierre de tarjeta bloqueado409 sin arqueo falso. Caja con ventas queda protegida pero pendiente de desglose persistido; no certificar conciliacion completa. Pruebas de negocio solo en fixtures aisladas; lectura remota adicional limitada a metadatos financieros, sin mutaciones. Servidor8080 no reiniciado al no poder identificar su proceso con seguridad; ejecucion real de cambios backend pendiente de reinicio controlado.


## Comandos (PowerShell)
Desde apps/web:
```powershell
npm run build
npm test -- --watch=false
```
Desde apps/api:
```powershell
.\mvnw.cmd test
```
Comprobar los scripts/versiones instalados si cambia la herramienta. Build no equivale a prueba funcional.

## Escenarios que deben cubrirse progresivamente
- Dos duenos: no leer ni modificar sede, venta, caja o inventario del otro, aun alterando IDs de la peticion.
- Jugador: acceso autenticado y denegacion de operaciones administrativas.
- Reiniciar/recargar: operaciones guardadas siguen presentes sin depender de localStorage.
- Red caida: no mostrar exito, no crear datos de reemplazo, permitir recuperacion sin duplicados.
- Reservas: horas consecutivas, cruce de tarifa, medianoche, cierre y solicitudes simultaneas.
- POS: turno obligatorio, stock insuficiente, pago mixto y conciliacion de efectivo.
- Devoluciones: parciales, limite neto pagado, autorizacion, restitucion selectiva de stock y comision.
- Fotos: upload, asociacion persistida, recarga y error de archivo.
- QR: escanear y confirmar destino. PDF: abrir con lector real y comprobar contenido.
- UI: botones funcionales o deshabilitados, skeleton/vacio/error, teclado, ventanas y cambio de sede.
- Inventario de controles: cada boton/enlace/menu/tarjeta pendiente debe estar gris y realmente deshabilitado; probar click, Enter y Space sin navegacion, envio ni aviso falso. CSS o aria-disabled solos no bastan.
- Alta de cancha: confirmar respuesta del servidor y lectura posterior con sesion del propietario, recarga y cache local desactivada en entorno de prueba. No borrar cache existente del usuario para comprobarlo.
- Visibilidad: comprobar el mismo propietario con dos sedes y dos cuentas, llegada asincrona del catalogo y respuesta 403/RLS. Una lista vacia con clave anon no prueba que el registro no exista.
- Desktop/movil: sin desbordamiento general, textos cortados ni hover decorativo.

## Evidencia de entrega
Para continuar fases con MCP, aplicar el protocolo privado del equipo si esta disponible; no es una dependencia de este documento publico. Verificar tambien que todo control pendiente este deshabilitado realmente.
Indicar comandos y resultado real, entorno de datos usado y limites.
No afirmar verificacion remota si solo se uso H2.
No guardar operaciones de prueba en la base compartida sin controlar su alcance y trazabilidad.
No borrar datos existentes como limpieza automatica.

## Mantenimiento documental
Verificar enlaces relativos, rutas de archivos y ausencia de secretos.
Actualizar ESTADO_ACTUAL y contratos al cambiar comportamiento.
# Verificacion local 2026-10-19: pagos y caja

Backend 110 pruebas/16 suites sin fallos; frontend 266/26, typecheck y build correctos. SQL probado con fixtures minimos en PostgreSQL WASM/PGlite, incluyendo triggers diferidos, roles e inmutabilidad. H2 cubre rollback y reintentos simultaneos por conexiones separadas. Sin migracion ni escritura remota; API en ejecucion no reiniciada con estos cambios. Activacion y verificacion autenticada pendientes segun [guia](PAGOS_Y_CAJA.md).
Actualizacion posterior 2026-10-19: migracion remota autorizada aplicada en transaccion y verificada tras COMMIT. RLS/FK/triggers/privilegios correctos; sin filas de pago generadas ni cambios en conteos de ventas/turnos/arqueos. Login y lecturas autenticadas de capacidades/estado caja correctos. Sin operaciones de negocio de prueba; no equivale a certificar un ciclo remoto completo de cobro y cierre.
Entrega limpia 2026-10-19: se exporto el indice Git a un directorio temporal sin .env.local, configuracion Angular generada ni dependencias previas. npm ci instala335 paquetes, audita337 y reporta cero vulnerabilidades conocidas en ese momento. La primera comprobacion detecto que typecheck dependia de environment.local.ts; corregido con pretypecheck y variables ficticias para todo el job web de CI. Repeticion correcta de typecheck,266 pruebas frontend y build; Maven verify correcto con110 pruebas y JAR generado. No se usaron secretos ni datos de Supabase para estas pruebas. Verificacion en GitHub Actions pendiente de la publicacion; no equivale a validar todas las operaciones reales.
