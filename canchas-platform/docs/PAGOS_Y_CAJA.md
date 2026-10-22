# Pagos POS y conciliacion de caja

## Estado

Implementado en fuentes y probado localmente el 2026-10-19. Migracion aplicada en Supabase el mismo dia con autorizacion explicita del usuario, tras confirmar proyecto y respaldo. No volver a ejecutarla en ese entorno.

Verificacion posterior: login autorizado correcto, GET /api/pos/payment-capabilities?sedeId=54 devuelve ready=true y GET /api/cash/venues/54/state devuelve pagosListos=true, sin turno abierto ni error de balance. La API actualizada ya estaba iniciada y detecto las tablas sin otro reinicio. No se abrieron turnos ni se registraron ventas, movimientos o cierres de prueba.

La aplicacion se hizo en una transaccion, con bloqueo temporal de tablas y cero turnos abiertos. Antes y despues del COMMIT se comprobaron RLS, cuatro FK, tres triggers habilitados, validacion diferida del total y permisos revocados de tablas, secuencia y funciones para anon/authenticated. Tablas nuevas vacias y cantidades de ventas, turnos y arqueos sin cambios. Esto no sustituye una prueba funcional completa de cobro/cierre en un entorno de pruebas.

La API guarda venta, detalles, Kardex, pagos y clave de operacion en una sola transaccion. Un fallo revierte todas esas escrituras. Los precios y stock se consultan en servidor; no se aceptan como autoridad los totales enviados desde el navegador.

## Modelo

- venta_pago: importe aplicado y recibido por venta y metodo. El vuelto de efectivo es recibido menos aplicado, no ingreso adicional.
- venta_operacion: clave de reintento por usuario autenticado y huella de peticion. Una repeticion identica devuelve la venta original; misma clave con otros datos devuelve conflicto.
- arqueo_caja: snapshots pagos_efectivo, ingresos_manuales y egresos_manuales. NULL en historicos significa desconocido, no cero.
- pago_reserva ya existente: solo se concilian pagos ligados explicitamente al turno mediante id_sesion_caja. No se infieren cobros a partir de montos de reservas, fecha ni datos locales.

Medios POS: efectivo, tarjeta, Yape y Plin; se admite combinacion. Son registros manuales de caja: NO conectan billeteras, verifican transferencias ni procesan tarjetas. No se almacenan credenciales de tarjeta.

## Procedimiento Para Otro Entorno

Los pasos siguientes son una referencia de instalacion, NO una indicacion de repetir la migracion en el entorno ya actualizado.

1. Identificar el proyecto Supabase correcto y preparar un respaldo. Revisar su esquema contra las FK y campos esperados. Confirmar que venta_pago y venta_operacion NO existen y que arqueo_caja aun no tiene las tres columnas nuevas. Si existen, detenerse y comparar; no borrar ni recrear.
2. Revisar [SQL de pagos](sql/2026-10-19_pagos_venta.sql). Ejecutar el bloque completo, de BEGIN a COMMIT, solo con autorizacion y durante una ventana sin cobros/cierres. Es aditivo, sin backfill ni registros ficticios. Si falla, ROLLBACK y diagnosticar antes de reintentar.
3. La conexion JDBC del servidor debe tener permisos sobre tablas, secuencia y funciones. RLS y REVOKE cierran acceso directo de anon/authenticated. No abrir politicas publicas ni poner credenciales privilegiadas en Angular. Un rol JDBC restringido requiere disenar sus permisos expresamente, no asumir que la migracion los concede.
4. Reiniciar la API con estas fuentes y recargar Angular. Comprobar autenticado GET /api/pos/payment-capabilities?sedeId=ID: ready debe ser true. Antes de la migracion, cobros/cierres quedan bloqueados; no se simula exito local.
5. Validar primero en un proyecto de pruebas: apertura, venta por cada medio, venta mixta, vuelto, reintento, stock, recarga, saldo y cierre fisico. Repetir con otra sede y otro propietario; deben rechazarse accesos cruzados. No generar ventas de prueba en produccion sin autorizacion.

## Conciliacion

Efectivo esperado = fondo inicial + pagos en efectivo del turno + ingresos manuales - egresos manuales. Digital se informa por separado. El servidor recalcula esperado y diferencia al cerrar; ignora esos valores si llegan del cliente.

Ventas/cierres/movimientos comparten bloqueo de fila del turno; las ventas bloquean productos antes de comprobar stock. Reintentos simultaneos del mismo turno quedan serializados. El cierre antiguo sin conteo fisico devuelve 409; usar PATCH /api/cash/sessions/{id}/close.

Ventas historicas sin desglose se muestran como sin_desglose y bloquean el cierre de su turno. No se reclasifican como efectivo. Requieren conciliacion humana con evidencia y un procedimiento separado. Los arqueos antiguos se marcan sin desglose disponible.

## Pruebas y limites

- Backend: 110 pruebas, 16 suites; H2 aislado. Incluye rollback con transaccion real, reintentos concurrentes por conexiones separadas, separacion de medios y rechazo de cobros de otra sede.
- Frontend: 266 pruebas, 26 suites; compilacion y typecheck correctos. Comprueba que errores no generen venta, movimiento ni cierre ficticio, y que una respuesta tardia no se aplique a otro usuario.
- SQL ejecutado en PostgreSQL WASM/PGlite en memoria con fixtures minimos: migracion, alias real de tarjeta, pago mixto, total diferido, inmutabilidad, turno cerrado, clave unica y bloqueo de rol navegador. No sustituye probar concurrencia y permisos JDBC en Supabase.
- API local reiniciada antes de la migracion. Migracion remota aplicada y comprobada; sin escrituras de negocio ni datos sinteticos. Verificacion autenticada limitada a lectura de capacidades y estado de caja, no una venta o cierre real.
- No incluye devoluciones, SUNAT, conciliacion bancaria automatica ni reconstruccion historica. Los numeros de comprobante actuales siguen siendo de control interno, no numeracion fiscal certificada.
- La clave POS se conserva en memoria durante un reintento sin cambiar la operacion. Tras recargar/cerrar la pagina, consultar historial antes de volver a cobrar si la respuesta anterior fue incierta.
- El total fisico se persiste; las cantidades por denominacion mostradas al cerrar siguen siendo detalle de esa vista, no un desglose historico persistido.
- La inicializacion reproducible del resto de la BD, la auditoria de secretos/CI y las demas fases no quedan certificadas por esta entrega.
