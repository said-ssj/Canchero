# Contratos API

## Ajuste 2026-10-17: operatividad de cancha
- Evidencia de integracion remota: cancha905/sede54 registrada y probada con pausa, recarga y habilitacion, sin duplicados. Auditoria usa `usmod='API'`/`pcmod='SPRING'` conforme a longitud real30; no insertar UUID36 en ese campo. Propiedad se comprueba antes de toda escritura. Estado final operativo.
- Compatibilidad de roles: dueno/dueño/owner/propietario y administrador se normalizan como en la autorizacion API existente, pero **todos**, incluido admin, deben ser el `id_dueno` de la sede. No se cambia ningun rol ni propietario en la BD. La verificacion real detecto `venueOwnership=true` y un rol administrativo rechazado por la primera validacion excesivamente restrictiva; corregido.
- `POST /api/courts/recover`: recupera una cancha local en la sede autenticada. Valida propietario real y rol; bloquea sede en transaccion. Mismo nombre normalizado en esa sede reutiliza registro sin sobrescribirlo; varias coincidencias devuelven409. No acepta propietarios del navegador ni IDs locales como identidad persistida. La recuperacion de borradores de la sede propia fue autorizada por el usuario el17oct.
- `CourtRequest` acepta `precioHoraNoche` y `horaInicioNoche` opcionales, conservando constructor anterior. Alta genera tarifas separadas dia/noche por dia; validacion rechaza importes negativos/no finitos y umbral fuera de08:00–23:00. No agrega tablas ni columnas. Esta franja base historica no sustituye horarios de apertura de la sede.
- `PUT /api/courts/{id}/operation`, Bearer de dueno autenticado; body `{ "disponible": false }` para mantenimiento, `true` para habilitar.
- Respuesta confirmada `{ "id": 123, "disponible": false }`. Verifica rol y propiedad por cancha -> sede -> id_dueno en servidor, bloqueando la fila durante la transaccion. 400 si falta estado, 401 sin sesion, 403 ajena, 404 inexistente o sede inactiva.
- Actualiza solo `cancha.estado` A/I y auditoria; no modifica reservas, cobros ni tarifas. El cliente espera respuesta y no guarda un exito local anticipado.
- `CourtDto` agrega `venueId` para asociar correctamente las canchas del catalogo al recuperar tambien inactivas; conserva constructores anteriores. Los borradores del navegador no forman parte del catalogo operativo.
- No certifica ni corrige el aislamiento de los otros endpoints historicos de canchas; siguen sujetos a la auditoria existente.

Inventario inicial del codigo al 2026-10-13, no garantia de autorizacion correcta en todos los endpoints.
Fuente ejecutable: apps/api/src/main/java/pe/canchero/backend/web/controller y web/dto.

## Endpoints observados

Actualizacion autenticacion 2026-10-16: POST /api/auth/login recibe email/password/rememberMe (boolean). true usa el limite vigente7dias; false token firmado de15min. Omision/null conserva true por compatibilidad. POST /api/auth/refresh requiere Bearer valido y usuario/rol activos, devuelve AuthResponse {token,user}; la duracion procede de la politica firmada original, no de un body enviado por cliente. Token expirado/invalido o cuenta inactiva ->401; error de BD ->503. Tokens legacy siguen validandose con politica persistente anterior. No hay migracion ni nueva tabla de sesiones.

Frontend: la restauracion /auth/me y renovacion usan HttpBackend con Authorization explicita para no reinyectar AuthService desde su propio constructor/interceptor. El cache no autoriza acceso por si mismo. rememberMe/lastActivityAt sobreviven recargas; false cierra localmente a los15min, incluso al reabrir tras vencer. Retorno validado a pagina y actividad visible renuevan tokens cortos (solicitudes agrupadas como maximo una por minuto), sin polling que mantenga viva una pagina abandonada. La expiracion firmada del servidor se cuenta desde emision/ultima renovacion; el contador local se cuenta desde ultima actividad. No se trata de una tabla de sesiones revocables por dispositivo ni de refresh tokens OAuth. La revocacion por logout de un token ya copiado sigue fuera de este cambio; conservar validacion de usuario/rol en cada peticion.
| Metodo/ruta | Contrato actual | Pendiente relevante |
| --- | --- | --- |
| POST /api/auth/login | LoginRequest -> respuesta con token y usuario | Sin bypass/fallback frontend; valida usuario.correo y credenciales en servidor |
| GET /api/venues | Lista de sedes | Distinguir catalogo publico y datos privados |
| PUT /api/venues/{id} | VenueRequest | Validar propietario autenticado |
| GET /api/venues/{sedeId}/hours | Lista DayHours | Modelo inicial por sede |
| PUT /api/venues/{sedeId}/hours | Lista de siete DayHours | Usuario autenticado, control propietario implementado |
| POST /api/bookings | BookingRequest -> BookingResponse, 201 | Horarios, precios y transiciones requieren consolidacion |
| PATCH /api/bookings/{id}/confirm,cancel,complete | Accion segun sufijo | No confundir estado de reserva con reembolso |
| GET /api/pos/products,inventory,sales | sedeId opcional | Exigir alcance autorizado, no confiar en sedeId |
| POST /api/pos/sales | ProcessSaleRequest -> SaleDto | Pago unico actual; ampliar a desglose e idempotencia |

Las comas en la tabla enumeran rutas distintas, no son parte de la URL.

DayHours actual:
```json
{"diaSemana":1,"apertura":"08:00","cierre":"23:00","activo":true}
```
Dias 0 a 6 sin duplicados, siete elementos al guardar. Puede cerrar al dia siguiente si cierre es menor que apertura.
Esto no implementa aun varias franjas por dia ni excepciones por cancha.

BookingRequest actual contiene courtName, venueName, venueId, courtId, playerId, fecha, horario, total, metodoPago, jugadores.
ProcessSaleRequest contiene tipoComprobante, metodoPago, cajeroNombre, clienteNombre, clienteDocumento, montoPagado, sesionCajaId, sedeId, usuarioId, items.
No confiar en el total o identidad enviados: la validacion de servidor debe derivar los valores autorizados.

## Regla para futuros contratos
### Correcciones de auditoria (2026-10-18)
- POST /api/reviews requiere sesion y reserva numerica completada de la misma sede, perteneciente al usuario autenticado; sin reserva/manual devuelve400 antes de escribir. El autor y cliente se derivan de esa reserva, no del cuerpo ni de un cliente nuevo. Duplicados incluso inactivos devuelven409; no devolver pases. Angular conserva el borrador ante fallo HTTP y no publica resenas locales como reales.
- PATCH /api/cash/sessions/{id}/close y POST /api/sesiones-caja/{id}/cerrar rechazan409 sin cerrar ni insertar arqueo cuando existen ventas activas sin desglose de pagos persistido. No inferir efectivo de venta.total. Es una proteccion temporal, no una implementacion completa de conciliacion; el modelo de pagos/BD sigue pendiente y no se aplicaron migraciones.

### Aislamiento POS corregido (2026-10-15)
- GET /api/pos/products, inventory y sales requiere sedeId positivo y auth.user verificado; 401 sin identidad, 400 sin sede, 404 sede inexistente/inactiva y 403 si no pertenece al UUID autenticado. Rol admin no da acceso a sedes ajenas.
- POST /api/pos/inventory/entries exige propiedad de request.sedeId y producto previamente vinculado por Kardex. Precio de entrada se registra en el movimiento, sin modificar costo del producto global para otras sedes.
- POST /api/pos/sales exige propiedad, turno abierto de esa sede y deriva usuarioId/cajeroNombre de la sesion verificada; no acepta identidad del navegador como autoridad.
- Productos sin movimientos de sede no aparecen como agotados: quedan fuera del inventario. Productos vinculados cuyo ultimo saldo real es cero si aparecen agotados.
- /api/productos listado/detalle tambien exige sede y propiedad. Altas/ediciones legacy sin contrato de pertenencia quedan bloqueadas con 501, no escriben catalogo global. Sus futuros controles deben permanecer grises/disabled. Sin consumidor Angular activo encontrado para estas escrituras.
- No asumir sede operativa global por defecto para lecturas POS. Rutas legacy de ventas que dependian de lecturas sin sede requieren adaptar contrato; no reabrir fallback global para hacerlas funcionar.
- Persistencia POS optimista restante, concurrencia y RLS/direct REST aun requieren auditoria; esta reparacion no certifica toda la contabilidad ni todos los endpoints legacy.

### Autenticacion activa (2026-10-15)
- Verificador actualizado: acepta bcrypt 2a/2b/2y y SHA-256 prefijado legacy; nunca texto plano ni formato desconocido. Nuevas altas bcrypt coste 12; no se actualizan claves de cuentas existentes al autenticar. Limite bcrypt 72 bytes UTF-8 (alta invalida 400). Dependencia crypto de Spring, no migracion a otro proveedor de identidad.
- POST /api/auth/login: { email, password }; consulta usuario.correo (normalizado), usuario y rol activos. Devuelve { token, user: { id, nombre, email, telefono, rol } } con UUID existente; 401 credenciales invalidas, 503 fallo de acceso a base sin detalles SQL.
- GET /api/auth/me: Bearer del backend; devuelve el perfil vigente del mismo UUID. 401 sin token/usuario activo, 503 si no puede consultar la base.
- POST /api/auth/register: contrato existente, persistencia en usuario.correo. Sin creacion alternativa via Supabase Auth cuando falla.
- Angular no autoriza mediante perfil local, correo con dueno/admin, owner-1 ni sesion Supabase historica. El guard padre e hijos espera /auth/me; fallo invalida cache y dirige a login. 401 en peticiones autenticadas invalida sesion.
- Pruebas aisladas aprobadas; login real de la cuenta existente pendiente de resolver conexion PostgreSQL y que el usuario ingrese su propia contrasena. No se crearon/reasignaron usuarios remotos.

### Lectura de caja por sede (2026-10-15)
- GET /api/cash/venues/{sedeId}/state, sin cuerpo; requiere usuario autenticado y propietario de la sede.
- Respuesta: { cajas: CashBoxDto[], sesion: CashSessionDto | null, movimientos: CashMovementDto[], arqueos: CashAuditDto[] }.
- Sin sesion abierta devuelve sesion null y movimientos vacios. Los arqueos pertenecen a sesiones de cajas de esa sede; nunca se sustituye por historial global.
- Errores: 401 sin identidad, 403 propietario distinto, 404 sede inexistente. No muta datos; se puede reintentar.
- Validado con H2 y servicio de datos stub. Despliegue y lectura remota pendientes. Este control no certifica los demas endpoints de caja.
- Alta presencial de invitado, adelantos, cobro de saldo, check-in y devoluciones: contratos pendientes. La UI no debe simular su persistencia.

Documentar entrada, salida, identificadores, moneda, zona horaria, permisos, codigos de error y comportamiento ante reintento.
Versionar cambios incompatibles o actualizar ambos extremos juntos.
No devolver exito cuando falle persistencia. No exponer excepciones SQL ni secretos.
Ver reglas de construccion para estados 400/401/402/403/404/409/422/429/5xx.
# Pagos y caja: cambio 2026-10-19

POST /api/pos/sales admite pagos [{metodoPago,monto,montoRecibido}] e idempotencyKey. La identidad se obtiene del token; precios/total son del servidor. GET /api/pos/payment-capabilities?sedeId comprueba estructura requerida tras validar propietario. Estado de caja agrega pagosListos, balance (sesionId,pagosEfectivo,pagosDigital,montoSistema) y balanceError. Arqueos agregan desgloseDisponible. Cierre sin desglose historico:409; esquema pendiente:503; legacy sin conteo fisico:409. Sin exito optimista en ventas/caja. Ver [activacion y limites](PAGOS_Y_CAJA.md); no desplegado ni migrado remotamente.
Actualizacion 2026-10-19: estructura de pagos ya desplegada en Supabase. API actualizada y login autorizado verificados: POS payment-capabilities ready=true y estado de caja pagosListos=true para sede54, sin turno abierto ni error de balance. No se registro venta/cierre real: la prueba funcional remota completa sigue pendiente. Ver [estado](PAGOS_Y_CAJA.md).
