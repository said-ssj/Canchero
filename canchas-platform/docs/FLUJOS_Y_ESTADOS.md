# Flujos y estados

Fuente normativa: ../../descargas/REGLAS_DE_NEGOCIO_CANCHERO.md.
Los estados aqui descritos son conceptuales; no asumir que coinciden con IDs o nombres de catalogos actuales.

## Reserva online objetivo
Elegir cancha y horas consecutivas -> calcular precio por tramos -> pagar 100% con tarjeta simulada -> aprobado: confirmar reserva.
Yape/Plin online deshabilitados. Efectivo solo presencial.
Pago rechazado o error tecnico no equivale a reserva confirmada.
Unir horas consecutivas de la misma cancha en un bloque.
La reserva debe respetar horarios, cierres y disponibilidad verificados en servidor.

## Propuesta tecnica de seleccion y persistencia online
Revision 2026-10-15; no implementada.
- Aclaracion de almacenamiento: Mi Itinerario es una consulta de reservas del usuario autenticado, no otra tabla ni archivo JSON. Reutilizar reserva, cancha, sede, cliente y pago_reserva existentes. JSON es formato de mensajes Angular/API, no fuente persistente ni respaldo local de operaciones.
- Orden de correccion recomendado: contexto por ID de cancha -> disponibilidad semanal real (sin identidades privadas) -> seleccion y agrupacion -> API autenticada que recalcula y persiste -> confirmacion tras aprobacion -> consulta privada de Mi Itinerario. Probar concurrencia y aislamiento antes de habilitar.
- Ampliaciones a disenar, no aplicar a ciegas: representacion de inicio/fin con fechas para medianoche, desglose historico de tarifas, idempotencia y proteccion de solapamientos; retencion con vencimiento solo si se acuerda, en entidad propia o estado persistido con expiracion explicita. No hace falta tabla por hora/casilla ni una tabla por jugador.
- Lectura de codigo 2026-10-15: createBooking ya tiene @Transactional, inserta reserva y pago_reserva y consulta cruces/bloqueos; no implica seguridad completa. Usa request.playerId/request.total, valida solo fin posterior a inicio en la misma fecha y hace SELECT previo a INSERT, que no garantiza exclusion concurrente. Corregir contrato/autoria/precio/concurrencia, no duplicar el servicio.
- Cada clic cambia un borrador de seleccion, no inserta una reserva confirmada por casilla. Ordenar por inicio y agrupar intervalos adyacentes de una misma cancha y operacion.
- Ejemplo: 18:00-19:00 + 19:00-20:00 -> una reserva 18:00-20:00; no extender sobre un hueco no seleccionado. Cruces de medianoche requieren inicio/fin con fecha completa y zona America/Lima.
- Usar reserva existente como cabecera del bloque, vinculada a cancha y cliente autenticado; sede y tipo se derivan. Guardar total historico y desglose de tramos tarifarios mediante contrato/migracion a disenar, sin inventar columnas ya disponibles.
- API recalcula tarifas y disponibilidad; valida horario/cierres y autor; transaccion e idempotencia evitan duplicados. Proteccion PostgreSQL contra solapamiento por cancha debe cubrir concurrencia, no solo SELECT previo. Restriccion de exclusion de rangos [inicio, fin) es candidata, pendiente contrastar estados/esquema y probar migracion aislada.
- Pago con resultado aprobado confirma el bloque; fallo conserva estado explicito sin exito local. No mantener transaccion SQL abierta durante una llamada de pago.
- Retencion es operacion distinta, persistida y atomica si se habilita; fecha de vencimiento y liberacion deben gestionarse en servidor. Plazo, inicio y politica ante pago tardio requieren acuerdo. No activar los 15 minutos historicos por defecto.
- Franjas no consecutivas: propuesta de bloques independientes; si se desea un unico checkout, pedido padre con varios bloques, sujeto a confirmacion de alcance. No unir todas las reservas futuras del mismo cliente.
- Referencia tecnica: https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT

## Reserva presencial objetivo
Dueno registra cancha, bloque y precio -> cobra completo o adelanto de 10% a 90% -> registra pago y saldo -> cobra saldo sin duplicar lo anterior.
Pendiente precisar alcance de configuracion del adelanto (sede/cancha) y plazo limite del saldo.
No trasladar este adelanto al flujo online.

## Separar estados
- Reserva: pendiente, confirmada, completada, cancelada, segun contrato final.
- Pago: pendiente, aprobado, rechazado; errores tecnicos aparte.
- Saldo: total acordado menos cobros netos; conservar devoluciones.
- Cerrar cancha no cancela automaticamente reservas existentes.
- Cancelar reserva no demuestra que se devolvio dinero.
- Definir expiracion de retenciones online antes de implementar; no reutilizar sin revision los 15 minutos del flujo Yape/Plin aplazado.

## Cierres
Seleccionar sede completa o cancha -> cierre inmediato/programado/descanso -> impedir nuevas reservas -> listar afectadas -> dueno reprograma o cancela.
No borrar reservas ni devolver dinero automaticamente.

## POS y caja
Abrir turno -> seleccionar productos de la sede -> validar stock -> distribuir pago -> guardar venta, partidas y movimientos consistentemente -> emitir comprobante interno.
Todos los vendedores requieren turno, incluido el dueno.
Pagos digitales no suman efectivo a la gaveta.
Reintento no puede generar otra venta de la misma operacion.

## Devolucion
Seleccionar operacion -> motivo e importe/partidas -> autoriza dueno -> registrar devolucion por medios originales -> ajustar saldo/caja/comision.
No superar lo pagado menos devoluciones anteriores.
Reponer productos solo si regresaron en condiciones de venta.

## Comision
5% a cargo del dueno sobre alquiler efectivamente cobrado y registrado, online o presencial.
No productos ni saldo aun no cobrado. Devolucion revierte la proporcion correspondiente.
No modificar importes historicos al cambiar tarifas.
Pendiente calendario y mecanismo de liquidacion; no inventar transferencias.

## Interfaz
Cada zona asincrona: cargando -> contenido o vacio o error.
Skeleton estatico, sin hover decorativo. Acciones pendientes grises y deshabilitadas.
Notificaciones solo campana; empleados en fase posterior.
