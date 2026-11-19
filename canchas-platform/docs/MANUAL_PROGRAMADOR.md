# Manual del programador — Canchero

Es el punto de entrada para quien retoma el proyecto. El detalle está en los documentos enlazados de `docs/`, que son la fuente autorizada de las reglas de negocio.

## 1. Arquitectura
```
Navegador (Angular 22, Vercel) ──HTTPS /api──► Spring Boot 3.4 / Java 21 (Render) ──JDBC──► PostgreSQL (Supabase)
        └── Supabase JS: solo Storage (fotos) y realtime de lectura; NO autentica
```
- **Monorepo** `canchas-platform/`: `apps/web` (npm workspace), `apps/api` (Maven, fuera de los workspaces), `packages/types`, `docs/`, `scripts/`.
- **Backend**: `web/controller` → `service` (JdbcTemplate; `JdbcSupport` agrupa la lógica común). No hay repositorios JPA. `ddl-auto: none`: el esquema es de Supabase.
- **Autenticación propia**: `ApiAuthorizationInterceptor` valida el bearer token (`AuthTokenService`, firmado con `SUPABASE_JWT_SECRET`) y decide qué rutas son públicas. Las contraseñas usan bcrypt con coste 12 (`PasswordUtil`).
- **Multiempresa**: toda operación sobre una sede pasa por `VenueAccessService` y la función SQL `tiene_permiso_sede`. La identidad del operador sale de la sesión, nunca del cuerpo de la petición. Ver [ROLES_Y_NEGOCIOS.md](ROLES_Y_NEGOCIOS.md).
- **Frontend**: `core/` (auth, guards, servicios, `DatabaseService`), `features/jugador/*` (bajo `MainLayout`), `features/admin/*` (rutas lazy bajo `AdminLayout` con `authGuard`), `shared/`. Las rutas están en `app.routes.ts`.

Más detalle: [ARQUITECTURA.md](ARQUITECTURA.md), [MAPA_DEL_PROYECTO.md](MAPA_DEL_PROYECTO.md), [CONTRATOS_API.md](CONTRATOS_API.md), [BASE_DE_DATOS.md](BASE_DE_DATOS.md), [PAGOS_Y_CAJA.md](PAGOS_Y_CAJA.md), [FLUJOS_Y_ESTADOS.md](FLUJOS_Y_ESTADOS.md), [MERCADOPAGO_CHECKOUT_PRO.md](MERCADOPAGO_CHECKOUT_PRO.md).

## 2. Puesta en marcha
Requisitos: Node 22 o 24, Java 21, y `pg_dump`/`psql` 17 para los respaldos.
```bash
cd canchas-platform
cp .env.example .env.local      # rellenar credenciales; NO sobrescribir uno existente
npm ci
npm run dev:web                 # http://localhost:4200
npm run dev:api                 # http://localhost:8080/api  (exportar las variables o usar scripts/start-api.ps1)
```
Las variables están explicadas en [GUIA_CREDENCIALES_Y_SERVICIOS.md](GUIA_CREDENCIALES_Y_SERVICIOS.md). El despliegue está en [GUIA_DESPLIEGUE_VERCEL_RENDER.md](GUIA_DESPLIEGUE_VERCEL_RENDER.md).

## 3. Comandos
| Tarea | Comando |
|---|---|
| Typecheck web | `npm run lint:web` |
| Tests web (Vitest) | `npm run test:web` |
| Tests API (JUnit, H2 en modo PostgreSQL) | `npm run test:api` |
| Un solo test API | `cd apps/api && ./mvnw test -Dtest=Clase#metodo` |
| E2E con capturas (Playwright) | `cd apps/web && npm run e2e` |
| Lighthouse por página | `node scripts/rendimiento.mjs lighthouse` |
| PageSpeed | `PSI_API_KEY=... node scripts/rendimiento.mjs pagespeed` |
| Caja negra de la API | `scripts/caja-negra.sh [URL]` |
| Respaldo / restauración de la BD | `scripts/backup-db.sh` / `scripts/restore-db.sh <dump> <url>` |

La CI (`.github/workflows/ci.yml`) ejecuta lint, tests y build de web y API. Husky aplica Prettier en cada commit. Cómo depurar y probar: [CALIDAD_Y_PRUEBAS.md](CALIDAD_Y_PRUEBAS.md).

## 4. Cómo agregar una funcionalidad
1. **Base de datos**: escribe la migración en `docs/sql/AAAA-MM-DD_nombre.sql` y aplícala **una sola vez** en el entorno de desarrollo. Haz un respaldo antes (`scripts/backup-db.sh`). Regenera los tipos con `npm run db:generate:types`.
2. **API**: crea el DTO en `web/dto`, el método en el servicio del área (heredando de `JdbcSupport`) y el endpoint en el controlador. Comprueba el permiso con `VenueAccessService`. Si la ruta es pública, regístrala en `ApiAuthorizationInterceptor.isPublicEndpoint`. Añade un test en `src/test`.
3. **Web**: crea el servicio en `core/services` y el componente standalone en `features/...` con signals. Añade la ruta lazy en `app.routes.ts`. La interfaz no muestra una operación como guardada hasta que la API la confirma.
4. Antes de hacer push, ejecuta `npm run lint:web && npm run test:web && npm run test:api`.

## 5. Convenciones
- El código, los comentarios, la interfaz y los documentos van en **español**.
- La moneda es PEN (`S/`). Los montos son `double`/`number`: no se garantiza exactitud contable.
- La zona horaria del negocio es `America/Lima` (`getLimaDate`, `getLimaHour`). Los horarios pueden cruzar la medianoche, así que se comparan fechas, no textos de hora.
- Los IDs de usuario son UUID; los de sede y cancha, numéricos.
- Los pagos son de prueba (Mercado Pago sandbox); no hay facturación SUNAT.
- `canchero-backend/` y `canchero-frontend/` son código heredado: no se editan.

## 6. Errores frecuentes
| Síntoma | Causa |
|---|---|
| La web no conecta a Supabase | Falta `.env.local`; el hook `pre*` genera `environment.local.ts` a partir de él |
| 401 en todas las llamadas | El token expiró, o el `SUPABASE_JWT_SECRET` de la API cambió |
| 403 en operaciones de sede | El usuario no tiene asignación en `asignacion_sede` con ese permiso |
| `pg_dump` falla con "server version mismatch" | Instala un `pg_dump` de la misma versión o superior a la del servidor |
| `pg_dump` se cuelga | Se está usando el puerto 6543 (transaction pooler); usa el 5432 |
| Los correos no salen en Render | Falta `RESEND_API_KEY` o `BREVO_API_KEY`, y `MAIL_FROM_EMAIL` |
