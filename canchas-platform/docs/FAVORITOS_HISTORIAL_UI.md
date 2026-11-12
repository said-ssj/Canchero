# Favoritos, menú e historial personal

Cambios del 12 de noviembre de 2026:

- Menú de usuario con iconos Material separados del texto. El foco automático
  al abrirlo no se representa como selección de «Mis reservas»; se conserva
  el indicador de navegación por teclado.
- Nueva ruta `/historial-pagos` desde el menú, protegida por sesión.
  Consulta `/api/me/payments` con paginación de 50 registros: sede, cancha,
  fecha/hora del partido, importe, método, fecha del registro, referencia y
  concepto (adelanto o pago de reserva). No genera comprobantes fiscales ni
  afirma devoluciones.
- El historial identifica al cliente por su vínculo con la cuenta autenticada.
  Ser creador administrativo de una reserva o dueño de la sede no convierte
  sus abonos en pagos propios. Se conservan pagos registrados de reservas
  canceladas; un error de consulta se muestra como error, no como historial vacío.
- Las estrellas guardan favoritos en la cuenta mediante GET/PUT/DELETE de
  `/api/me/favorite-venues`. No anuncian guardado hasta recibir confirmación.
  Lista y detalle comparten el estado; cerrar sesión descarta los datos y las
  respuestas pendientes de la cuenta anterior. Un visitante puede iniciar sesión
  desde la acción de favoritos.
- La campana de las tarjetas de sedes queda deshabilitada, sin manejador ni
  cambios de preferencias. La estrella conserva el guardado sincronizado;
  ambos iconos son transparentes y sin fondos cuadrados. La campana del detalle
  conserva solamente su preferencia local; no se envian notificaciones externas.
- Ninguna cancha queda elegida al entrar a una sede o cambiar filtros.
  Cada botón «Elegir horario» mantiene su enlace a la cancha correspondiente;
  el resumen invita a elegir una cancha antes de mostrar una selección.

## Supabase

Se aplicó `20261112080000_favoritos_sede.sql` al proyecto existente: **una tabla
nueva, `public.favorito_sede`**, con clave compuesta usuario/sede, claves foráneas,
RLS y acceso directo revocado a `anon`, `authenticated` y `PUBLIC`.
No se crearon favoritos de muestra ni se modificaron reservas o pagos.
El historial reutiliza `pago_reserva`, `reserva`, `cliente`, `cancha` y `sede`.

## Verificación y publicación

Pruebas de PostgreSQL para persistencia, idempotencia, aislamiento de favoritos,
RLS y separación del historial entre cliente, otra cuenta y dueño creador.
Pruebas Angular para estados de error, confirmación del guardado, descarte de
respuestas tras cambiar de cuenta y ausencia de selección inicial de cancha.

La migración ya está aplicada. El despliegue requiere publicar frontend y API
compatibles. La verificación local no certifica el estado del despliegue remoto.
