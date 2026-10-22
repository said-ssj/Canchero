# Mapa del proyecto

## Carpetas
- apps/web: Angular activo.
- apps/api: Spring Boot activo.
- packages: espacio compartido declarado en workspaces; comprobar su contenido antes de depender de el.
- supabase: funciones y configuracion existente; no implica que esten desplegadas o aprobadas para uso real.
- ../descargas: reglas originales, plan y referencia SQL.
- ../canchero-frontend: aplicacion alternativa con dependencias distintas. No sincronizada automaticamente.
- ../canchero-backend: contiene target; no es fuente activa.

## Ubicaciones frontend (relativas a apps/web/src/app)
| Pantalla o tarea | Ubicacion |
| --- | --- |
| Rutas | app.routes.ts |
| Inicio / index | features/jugador/home |
| Listado de sedes | features/jugador/sedes |
| Detalle de sede | features/jugador/detalle |
| Reserva y pago | features/jugador/checkout |
| Itinerario | features/jugador/itinerario |
| Login / registro | features/jugador/auth |
| Contenedor admin activo y ocho rutas hijas | features/admin/layout/admin-layout.ts, app.routes.ts |
| Contexto comun de identidad/sede/carga | features/admin/admin-context.service.ts |
| Estado compartido cuando falta sede propia | features/admin/components/venue-required/venue-required.ts, .html, .css |
| Compatibilidad del antiguo Admin | features/admin/admin.ts, admin.html (no es el shell activo) |
| Mi Sede (integrado en Admin) | features/admin/sedes/admin-sedes.ts, .html, .css |
| Mis Canchas (integrado en Admin) | features/admin/canchas/admin-canchas.ts, .html, .css, admin-canchas.models.ts |
| Reservas: consulta, filtros, detalle y CSV (integrado) | features/admin/reservas/admin-reservas.ts, .html, .css, .models.ts, .utils.ts |
| Tarjeta de sede | features/admin/components/sede-card |
| Accion para agregar | features/admin/components/add-action |
| Estilos del shell activo | features/admin/layout/admin-layout.css importa styles/; cada modulo tiene su CSS |
| Modulos Material usados por admin | features/admin/admin.material.ts |
| Acceso a datos | core/supabase/database.service.ts |
| Sesion y credenciales | core/auth |
| Caja / POS / mapas | core/services |
| Modelos de interfaz | shared/models |

Tema global: apps/web/src/styles/tema.css. Entrada global: apps/web/src/styles.css.
Variables admin: features/admin/styles/personalizacion.css.
No agregar un segundo ajuste de dimensiones sin revisar la regla que ya gobierna el componente.

## Backend (relativo a apps/api/src/main/java/pe/canchero/backend)
- web/controller: endpoints.
- web/dto: contratos actuales.
- service/SupabaseDataService.java: SQL y multiples operaciones del negocio.
- service/VenueHoursService.java: horario semanal por sede, implementacion inicial.
- config/ApiAuthorizationInterceptor.java: verificacion actual de sesion y rol.
- service/AuthTokenService.java: tokens propios actuales.
- src/test del modulo API: pruebas de horarios existentes.

## Rutas actuales
/, /sedes, /sedes/:id, /checkout, /itinerario, /login, /registro, /admin.
La ruta comodin actualmente redirige a inicio: las paginas de error dedicadas siguen pendientes.

Verificado el 2026-10-14: /admin conserva el contenedor original e integra AdminSedes, AdminCanchas y AdminReservas (consulta; alta presencial pendiente). No hay rutas hijas activadas. Los restantes esqueletos modulares y AdminLayout no sustituyen las pantallas existentes.
El CSS de tarjetas/editor de canchas vive en canchas/admin-canchas.css; styles/04-canchas.css solo conserva la nota de traslado. Algunas hojas comunes siguen importadas por los componentes durante la transicion.

## Como editar
Para tamanos de una foto, localizar el componente que realmente la renderiza, su clase HTML y CSS vigente.
No editar una clase legacy con nombre parecido sin confirmar que se usa.
La guia apps/web/GUIA-EDICION.md explica HTML, CSS y TS para quien retoma el proyecto.
