# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

All active code lives in `canchas-platform/` (npm workspace root). `canchero-backend/` and any `canchero-frontend` are discarded legacy — do not edit them.

- `apps/web` — Angular 22 SPA (standalone components, Angular Material/CDK, signals, Vitest via `@angular/build:unit-test`).
- `apps/api` — Spring Boot 3.4, Java 21, Maven wrapper. Not an npm workspace.
- `packages/types` — shared TS types (`db:generate:types` regenerates `supabase.types.ts`).
- `docs/` — Spanish design docs; `ARQUITECTURA.md`, `CONTRATOS_API.md`, `BASE_DE_DATOS.md`, `PAGOS_Y_CAJA.md`, `FLUJOS_Y_ESTADOS.md` are the authoritative references for business rules.

Code, comments, docs and UI text are in Spanish.

## Commands (run from `canchas-platform/`)

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Web dev server (:4200) | `npm run dev:web` |
| Web typecheck ("lint" = `tsc --noEmit` on app + spec tsconfigs) | `npm run lint:web` |
| Web tests | `npm run test:web` |
| Single web test file | `cd apps/web && npx ng test --include src/app/path/to/file.spec.ts` |
| Web build | `npm run build:web` |
| API run (:8080, paths under `/api`) | `npm run dev:api` (needs env vars below exported) or `scripts/start-api.ps1` (loads `.env.local`, normalizes JDBC; `-ValidateOnly` to just check config) |
| API tests | `npm run test:api` |
| Single API test | `cd apps/api && ./mvnw test -Dtest=CourtOperationServiceTest` (or `-Dtest='Class#method'`) |
| API jar | `cd apps/api && ./mvnw package -DskipTests` |

CI (`.github/workflows/ci.yml` at repo root) runs lint:web, test:web, build:web, then `./mvnw test` and `package`. A husky pre-commit hook runs Prettier via lint-staged on `apps/web/src/**/*.{ts,html,css}`.

## Environment

Secrets go in `canchas-platform/.env.local` (gitignored; template `.env.example`). Never overwrite an existing `.env.local`.
- Web: every web npm script has a `pre*` hook running `apps/web/scripts/load-env.mjs`, which writes `src/environments/environment.local.ts` (gitignored) from `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_MAPS_API_KEY` (process env wins over file).
- API: `SPRING_DATASOURCE_URL/USERNAME/PASSWORD`, `SUPABASE_JWT_SECRET` (legacy name — it signs Canchero's own session tokens, not Supabase's).

## Architecture

**Backend** (`apps/api/src/main/java/pe/canchero/backend`):
- `web/controller` → `service` → plain JDBC. Data access is `JdbcTemplate` in per-area services (`AuthService`, `VenueService`, `BookingService`, `PosService`, `CashService`) that extend `JdbcSupport` (shared jdbc + date/format/catalog helpers); role checks live in `Roles`; JPA is on the classpath but there are no JPA repositories — don't introduce them as if they existed.
- `ddl-auto: none`: the schema is owned by Supabase/Postgres and is not created by the app. Incremental migrations are documented in `docs/` and must not be re-run against the dev DB they were already applied to.
- Auth is custom, not Spring Security: `ApiAuthorizationInterceptor` (registered in `WebConfig` on `/api/**`) validates the bearer token via `AuthTokenService`, sets request attribute `auth.user`, whitelists public endpoints (`/api/auth/login|register`, `/api/catalog`, GET on venues/courts/reviews/`bookings/pase/`), and enforces owner/admin roles. Passwords: `PasswordUtil` (bcrypt cost 12; legacy prefixed SHA-256 verify-only).
- Multi-tenant rule: every mutation on venues/courts/bookings/cash must check the venue owner (`s.id_dueno = authUser.id`) or a platform admin (`VenueAccessService.canManage`) → 403 otherwise. Operator identity comes from the verified session, never from the request body. Cash expected balances are computed server-side, never accepted from the client.
- Tests: `src/test/resources` uses H2 in PostgreSQL mode. Tests under `it/` (`Postgres*Test`) spin up a real local Postgres via `PostgresTestServer` (binary from `TEST_POSTGRES_BIN` or PATH) and are skipped via JUnit assumptions when it's unavailable.

**Frontend** (`apps/web/src/app`):
- `core/` (auth service + interceptor, `authGuard`, services, `supabase/` client + `DatabaseService`, utils), `features/jugador/*` (public player flow under `MainLayout`), `features/admin/*` (lazy routes under `AdminLayout`, guarded; `AdminContext` service coordinates identity/venue/loading; the old `admin.ts` component is compatibility-only, not the active shell), `shared/`.
- `AuthService` authenticates only against the Spring backend; a cached token must be validated with `/auth/me` before exposing the user. The Supabase client remains for data/Storage only — not an auth fallback.
- `DatabaseService` still mixes Spring HTTP calls, direct Supabase queries and localStorage; new business operations should go UI → authenticated API → validation/transaction → response, and must not show a sale/operation as saved before the API confirms it.

## Domain conventions

- Currency PEN (shown as `S/`). Amounts are still double/number today; don't claim accounting exactness.
- Business timezone `America/Lima` (use `core/utils` helpers like `getLimaDate`/`getLimaHour`). Schedules can cross midnight — compare with dates, not hour strings.
- User IDs are UUIDs; venue/court IDs are numeric.
- Online card payments are simulated; no real gateway or SUNAT invoicing.
