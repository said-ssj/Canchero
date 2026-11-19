# Manual de usuario — Canchero

Canchero es una plataforma web para **buscar y reservar canchas deportivas** y para que los **dueños de complejos** gestionen sus sedes, sus reservas, la caja y la tienda (POS).
Dirección: https://canchero-iota.vercel.app. Funciona en el navegador del celular o de la computadora; no hace falta instalar nada.

> Las capturas de cada pantalla se generan con `cd apps/web && npm run e2e` y se ven en `npx playwright show-report e2e/reporte` (ver CALIDAD_Y_PRUEBAS.md §3).

---

## Parte A — Jugadores

### A.1 Crear una cuenta e iniciar sesión
1. Pulsa **Iniciar sesión** en la barra superior (ruta `/login`).
2. Para crear una cuenta nueva, entra en **Regístrate** (`/registro`) y completa tus nombres, correo, teléfono y contraseña. También puedes usar **Continuar con Google**.
3. La primera vez que entres se te pedirá **completar tu perfil** (nombre de usuario, foto opcional) antes de continuar.
4. ¿Olvidaste tu contraseña? En **¿Olvidaste tu contraseña?** (`/recuperar`) ingresa tu correo y sigue el enlace que recibirás.

Por seguridad, después de varios intentos fallidos la cuenta se pausa unos minutos. Si se bloquea, recibirás un correo para desbloquearla.

### A.2 Buscar una cancha
- **Sedes** (`/sedes`): lista de complejos con foto, distrito y precio. Usa el buscador y los filtros.
- **Buscar** (`/buscar`): búsqueda por nombre, deporte o ubicación.
- Pulsa una sede para ver su **detalle**: fotos, canchas, horarios disponibles, ubicación en el mapa, reseñas y contacto.

### A.3 Reservar y pagar
1. En el detalle de la sede, elige la **cancha**, la **fecha** y uno o más **bloques horarios seguidos**. Las horas contiguas se unen en una sola reserva.
2. Pulsa **Continuar**. En **Datos del partido** indica cuántos jugadores asistirán (no puede superar la capacidad de la cancha).
3. **Revisar y pagar**: el precio lo calcula el sistema según la tarifa (puede variar en horario nocturno).
4. Se abre **Mercado Pago** (entorno de prueba) para pagar el 100 %. El horario queda separado por 10 minutos mientras pagas.
5. Al volver verás el **resultado del pago**. La reserva queda confirmada solo cuando el pago está aprobado; un pago rechazado no reserva la cancha.

> En la versión académica los pagos son de **prueba**: no se cobra dinero real ni se emiten comprobantes SUNAT.

### A.4 Mis reservas (Itinerario) y pase digital
- En **Itinerario** (`/itinerario`) ves tus reservas con fecha, cancha, horario, estado y pago.
- Cada reserva confirmada tiene un **pase digital con código QR**. Muéstralo en recepción: el encargado lo escanea, y el pase es válido desde 15 minutos antes del partido hasta que termina.
- **Compartir por WhatsApp** envía los datos del partido a tu equipo.
- Tu historial de pagos está en **Historial de pagos** (`/historial-pagos`).
- Para cancelar o reprogramar, comunícate con la sede (teléfono o WhatsApp en su ficha). Cancelar una reserva no implica una devolución automática.

### A.5 Perfil, comunidad y mensajes
- **Mi perfil** (`/perfil`): foto, nombre de usuario, deportes y publicaciones. Otros jugadores ven tu perfil público en `/perfiles/<id>` y pueden seguirte.
- **Mensajes** (`/mensajes`): chat privado con otros usuarios. Puedes **bloquear** o **reportar** a alguien desde la conversación.
- **Mi cuenta** (`/cuenta`): datos de contacto, contraseña, preferencias de notificación y descarga o eliminación de tus datos.
- **Ayuda** (`/ayuda`): preguntas frecuentes y contacto de soporte por WhatsApp (08:00–23:00).

---

## Parte B — Dueños y personal de sedes (panel `/admin`)

Al iniciar sesión con una cuenta de dueño o con una cuenta asignada a una sede, aparece el **panel de administración**. A la izquierda está el menú lateral; arriba, el **selector de sede**, que define sobre qué sede trabajas, y la campana de notificaciones.

### B.1 Quién puede hacer qué
| Rol | Puede |
|---|---|
| Dueño | Todo en sus sedes: crear y editar sedes y canchas, personal, finanzas, caja y POS |
| Admin | Las sedes que le asignaron: operación, finanzas y personal operativo |
| Cajero | Cobros y ventas en su propio turno de caja |
| Almacén | Catálogo, precios y entrada de mercadería |
| Ayudante | Agenda sin montos, verificación de pases e incidencias |

Si intentas abrir una sección que tu rol no permite, el sistema la bloquea.

### B.2 Módulos
| Menú | Para qué sirve |
|---|---|
| **Sedes** | Crear y editar el complejo: dirección, mapa, fotos, horario semanal y cierres (feriados, mantenimiento) |
| **Canchas** | Crear canchas: tipo, capacidad, fotos y tarifas (diurna y nocturna). Al cerrar una cancha se listan las reservas afectadas para reprogramarlas o cancelarlas |
| **Reservas** | Agenda con filtros; registrar una **reserva presencial** (pago completo o adelanto del 10–90 %), cobrar el saldo, reprogramar o cancelar, exportar a CSV |
| **Accesos** | Escanear o ingresar el código QR del pase del jugador para registrar su ingreso |
| **Caja** | **Abrir un turno** con el monto inicial, registrar ingresos y egresos y **cerrar con arqueo**. El sistema calcula el efectivo esperado; el efectivo y los pagos digitales se muestran por separado |
| **POS** | Venta de productos (bebidas, alquiler de implementos). Requiere un turno de caja abierto. Muestra el stock y el vuelto, y genera un comprobante interno |
| **Catálogo / Inventario / Compras** | Productos, categorías y precios; kardex de stock; compras a proveedores, que suman al stock |
| **Créditos** | Cuentas por cobrar a clientes frecuentes y sus abonos |
| **Finanzas / Reportes** | Alquileres cobrados, devoluciones, comisión de la plataforma (5 % sobre alquileres cobrados) y montos netos; reportes por fecha |
| **Personal** | Invitar empleados a una sede y asignarles un rol |
| **Personalización** | Colores, textos y QR de la sede, con vista previa |
| **Configuración** | Cuenta, seguridad y preferencias |

### B.3 Rutina diaria sugerida
1. Elegir la sede en el selector → **Caja → Abrir turno**.
2. Revisar la agenda en **Reservas** y validar los ingresos en **Accesos**.
3. Vender en **POS** y cobrar los saldos de las reservas presenciales.
4. Al terminar: **Caja → Cerrar turno**, contar el efectivo por denominación y revisar la diferencia.

---

## Problemas frecuentes
| Problema | Solución |
|---|---|
| "Sesión expirada" | Vuelve a iniciar sesión |
| No veo el panel admin | Tu cuenta no es de dueño o no tiene una sede asignada; pide al dueño que te invite en **Personal** |
| El POS no deja vender | Abre primero un turno en **Caja** |
| No aparece un horario | Ya está reservado, está fuera del horario de la sede o la cancha tiene un cierre |
| La primera carga es lenta | El servidor gratuito "despierta" tras un rato sin uso; espera unos 30 a 60 segundos |
