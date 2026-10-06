# Canchas Platform - Monorepo

Plataforma completa para gestión de canchas deportivas (fútbol, pádel, tenis) con reservas, pagos, facturación electrónica SUNAT y administración multi-sede.

## 🚀 Inicio Rápido (Producción con Supabase Cloud)

```bash
# 1. Ir a la carpeta del monorepo
cd canchas-platform

# 2. Instalar dependencias (desde la raíz del monorepo)
npm install

# 3. Configurar credenciales reales en la raíz del monorepo
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase Cloud:
# SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
# SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# SUPABASE_SERVICE_ROLE_KEY=... (solo para scripts admin)

# 4. Instalar dependencias del frontend Angular
cd apps/web && npm install

# 5. Crea una cuenta desde la app o Supabase Dashboard. Los usuarios nuevos tienen rol cliente.

# 6. Levantar frontend
npm run start
# Abre http://localhost:4200
```

> **Autenticación Supabase Auth:** La app usa **exclusivamente Supabase Auth**. No hay fallback a base de datos local. Los usuarios deben existir en Supabase Auth y sincronizarse a la tabla `usuario` via trigger.
>
> El frontend carga `SUPABASE_URL` y `SUPABASE_ANON_KEY` (o sus equivalentes `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) desde `.env.local` antes de iniciar, compilar o ejecutar pruebas. Si faltan, el proceso falla con un mensaje explícito. Nunca pongas `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

---

## 📁 Estructura del Monorepo

```
canchas-platform/
├── apps/
│   ├── web/                      # Angular 22+ (SSR/SSG) → Vercel/Netlify
│   │   ├── src/app/
│   │   │   ├── core/             # Singleton services, guards, interceptors
│   │   │   │   ├── auth/         # AuthService (Supabase Auth only)
│   │   │   │   ├── guards/       # Route guards
│   │   │   │   ├── interceptors/ # HTTP interceptors
│   │   │   │   └── supabase/     # Supabase client + DatabaseService (schema real)
│   │   │   ├── shared/           # Código compartido
│   │   │   │   ├── components/   # Navbar, Footer, MainLayout, UI kit
│   │   │   │   ├── models/       # Interfaces compartidas (User, Venue, Court, Booking)
│   │   │   │   ├── pipes/        # Pipes comunes
│   │   │   │   ├── directives/   # Directivas comunes
│   │   │   │   └── utils/        # Utilidades
│   │   │   ├── features/         # Feature modules (lazy-loaded)
│   │   │   │   ├── jugador/      # PWA pública
│   │   │   │   │   ├── home/
│   │   │   │   │   ├── sedes/
│   │   │   │   │   ├── detalle/
│   │   │   │   │   ├── reservas/
│   │   │   │   │   ├── checkout/
│   │   │   │   │   ├── itinerario/
│   │   │   │   │   ├── auth/ (login, registro)
│   │   │   │   │   ├── perfil/
│   │   │   │   │   ├── equipos/
│   │   │   │   │   └── suscripciones/
│   │   │   │   ├── admin/        # Panel dueño
│   │   │   │   │   ├── reportes/
│   │   │   │   │   ├── canchas/
│   │   │   │   │   ├── precios/
│   │   │   │   │   ├── finanzas/
│   │   │   │   │   ├── personalizacion/
│   │   │   │   │   └── staff/
│   │   │   │   └── caja/         # Panel operador/caja
│   │   │   │       ├── cobros/
│   │   │   │       ├── inventario/
│   │   │   │       └── turnos/
│   │   │   └── app.routes.ts     # Rutas principales con lazy loading
│   │   └── (configs: angular.json, package.json, tsconfig, etc.)
│   └── api/                      # Spring Boot legacy (preservado)
│
├── supabase/                     # Backend principal (migración objetivo)
│   ├── config.toml
│   └── functions/                # Edge Functions
│       ├── _shared/              # CORS, auth helpers, Supabase client
│       ├── pagos-culqi/          # Cargos, webhooks, reembolsos (Culqi/Yape/Plin)
│       ├── facturacion-sunat/    # Emisión CPE, XML UBL 2.1, QR (SUNAT)
│       ├── notificaciones/       # FCM Push, Twilio WhatsApp, SendGrid Email
│       └── reservas/             # Disponibilidad tiempo real, bloqueos, lista espera
│
├── packages/
│   ├── types/                    # supabase.types.ts (generado desde DB con `npm run db:generate:types`)
│   └── utils/
│
├── infra/
│   ├── cloudflare/               # waf-rules.md (rate limits, WAF, cache, headers seguridad)
│   └── monitoring/               # monitoring-config.md (Sentry, Grafana Cloud, PagerDuty)
│
├── .github/workflows/ci-cd.yml   # Pipeline completo: lint, test, build, e2e, a11y, security, deploy
│
├── .env.example                  # Variables de entorno de referencia
├── .env.local                    # Tus credenciales reales (NO commitear, en .gitignore)
├── package.json                  # Workspace root con scripts monorepo
├── tsconfig.json                 # Path aliases: @core/*, @shared/*, @features/*, @env/*
├── .gitignore
└── README.md
```

---

## ⚙️ Scripts Principales

| Comando | Descripción |
|---------|-------------|
| `npm run dev:web` | Levantar Angular dev server (`apps/web`) |
| `npm run build:web` | Build de producción Angular |
| `npm run test:web` | Pruebas unitarias Angular |
| `npm run dev:api` | Levantar Spring Boot dev (legacy) |
| `npm run build:api` | Build JAR Spring Boot |
| `supabase start` | Levantar stack Supabase local (Docker) |
| `npm run db:generate:types` | Generar tipos TS desde DB Supabase |

> El SQL de referencia es [`descargas/Querry SQL Postgrest Canchero.txt`](../descargas/Querry%20SQL%20Postgrest%20Canchero.txt). Se retiraron las migraciones antiguas de `supabase/migrations/` porque definían otro esquema (`usuario.id`, `auth_uid`, `email`) incompatible con el esquema real (`id_usuario`, `correo`, `id_rol`). No ejecutes `supabase db push` hasta crear migraciones alineadas con ese DDL.

---

## 🔐 Autenticación

### Flujo Supabase Auth (único)

1. **Login/Register** via `supabase.auth.signInWithPassword()` / `signUp()`
2. **Trigger BD** `handle_new_user()` crea el perfil en `usuario` con `id_usuario = auth.users.id`
3. **Rol** se obtiene desde `usuario.id_rol` y `rol.nombre`; el frontend no confía en el rol solicitado en metadata
4. Las cuentas que solicitan gestionar una sede se crean como clientes. Un administrador debe validar la solicitud y asignar el rol de dueño en `usuario.id_rol`.
5. **Sesión** persistida en localStorage por Supabase JS client

> **Importante:** El perfil y el rol inicial `cliente` dependen del trigger de sincronización. No uses credenciales demo en producción.

---

## 🗄️ Base de Datos (Schema Real)

> **Importante:** el DDL de referencia no define políticas RLS. Antes de exponer estas tablas vía la API de Supabase, crea y valida políticas para el esquema real. Las políticas antiguas también fueron retiradas porque dependían de nombres de columnas que no existen en este DDL.

La app consulta directamente las tablas de tu Supabase Cloud:

| Tabla | Descripción | PK |
|-------|-------------|----|
| `usuario` | Usuarios del sistema (sincronizado desde Auth) | `id_usuario` (UUID) |
| `sede` | Complejos deportivos | `id_sede` (SERIAL) |
| `cancha` | Canchas por sede | `id_cancha` (SERIAL) |
| `tipo_cancha` | Catálogo: Grass 7, Grass 5, Futsal, Techada | `id_tipo_cancha` |
| `reserva` | Reservas de canchas | `id_reserva` (SERIAL) |
| `pago_reserva` | Pagos de reservas (comisión 5% auto) | `id_pago_reserva` |
| `tarifa_cancha` | Precios por día/hora | `id_tarifa` |
| `estado_reserva` | Estados: pendiente, confirmada, cancelada | `id_estado_reserva` |
| `metodo_pago` | Yape, Plin, Tarjeta, Efectivo, Transferencia | `id_metodo_pago` |
| `tipo_horario` | Horarios de atención por sede | `id_tipo_horario` |
| `bloqueo_mantenimiento` | Bloqueos de canchas | `id_bloqueo` |

> **Auditoría:** Todas las tablas incluyen 7 campos: `usucre`, `pccre`, `feccre`, `usmod`, `pcmod`, `fecmod`, `estado` (`A`/`I`)

### DatabaseService - Mapeo Legacy

El `DatabaseService` expone signals con propiedades **legacy compatibles** (para no romper código existente) mapeadas desde el schema real:

```typescript
// Schema real → Legacy expuesto
id_cancha          → id
nombre_numero      → nombre
correo             → email
id_sede            → sede_id
estado ('A'/'I')   → activa (true/false)
id_reserva         → id
id_estado_reserva  → estado (nombre del estado)
id_pago_reserva    → id
```

---

## 🔧 Variables de Entorno

### `.env.local` (raíz `canchas-platform/`) - NO commitear

```env
# Supabase Cloud (producción)
SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=... (solo scripts admin/Edge Functions)

# Frontend (Angular usa environment.ts)
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Pagos Culqi
CULQI_PUBLIC_KEY=pk_test_xxx
CULQI_SECRET_KEY=sk_test_xxx
CULQI_WEBHOOK_SECRET=whsec_xxx

# SUNAT
SUNAT_RUC=20123456789
SUNAT_USER=MODDATOS
SUNAT_PASSWORD=xxx
SUNAT_ENDPOINT=https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService

# Notificaciones
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
SENDGRID_API_KEY=SG.xxx
FCM_SERVER_KEY=xxx

# Legacy API (Spring Boot)
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:54322/postgres
JWT_SECRET=xxx
```

### `apps/web/src/environments/environment.ts`

El cargador de entorno genera `environment.local.ts` desde `.env.local` antes de iniciar, compilar o probar el frontend. Usa `SUPABASE_URL` y `SUPABASE_ANON_KEY` (o sus variables `VITE_` equivalentes); los valores de ejemplo son rechazados. La clave `SUPABASE_SERVICE_ROLE_KEY` no debe exponerse al frontend.

```typescript
export const environment = {
  production: false,
  supabaseUrl: supabaseConfiguration.url,
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  apiUrl: 'http://localhost:8080/api',
  isDemoMode: false,
};
```

---

## 🏗️ Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| **Frontend** | Angular 22+, SSR/SSG, PWA, Signals, RxJS, Lazy Loading |
| **Backend** | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| **Backend (legacy)** | Spring Boot 3 + JPA (preservado en `apps/api/`) |
| **Pagos** | Culqi (Yape, Plin, Tarjetas) |
| **Facturación** | SUNAT (XML UBL 2.1, QR, PDF) |
| **Notificaciones** | FCM (Push), Twilio (WhatsApp), SendGrid (Email) |
| **Infra** | Vercel (Frontend), Supabase Cloud (Backend), Cloudflare (CDN/WAF) |
| **Observabilidad** | Sentry, Grafana Cloud, PagerDuty |
| **CI/CD** | GitHub Actions (lint, test, e2e, a11y, security, deploy) |

---

## 📋 Requisitos

- Node.js >= 20
- npm >= 10
- Java 21 (para backend legacy Spring Boot)
- Maven 3.9+
- Supabase CLI (para migraciones y tipos)
- Docker (opcional, para Supabase local)

---

## 📚 Documentación

- [Plan de Producción](descargas/PLAN_PRODUCCION_CANCHERO.md)
- [DDL Supabase de referencia](../descargas/Querry%20SQL%20Postgrest%20Canchero.txt)
- [WAF Rules](infra/cloudflare/waf-rules.md)
- [Monitoring Config](infra/monitoring/monitoring-config.md)
- [API Reference](docs/api.md) *(pendiente)*

---

## 📦 Despliegue

### Frontend (Vercel)

1. Conectar repo a Vercel
2. Configurar variables de entorno (Project URL, Anon Key)
3. Deploy automático en push a `main`

### Backend (Supabase Cloud)

No hay migraciones versionadas activas todavía. No uses `supabase db push` hasta añadir migraciones alineadas con el DDL real y políticas RLS revisadas.

```bash
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy
```

### Legacy API (Railway/Render/Fly.io)

```bash
npm run build:api
# Deploy JAR generado
```

---

## ⚖️ Compliance Legal (Perú)

- ✅ Ley 29733 - Protección Datos Personales
- ✅ SUNAT - Facturación Electrónica (CPE, QR)
- ✅ SBS Circular 002-2022 - Medios de Pago, PCI-DSS SAQ-A
- ✅ Código Protección Consumidor
- ✅ Ley 29973 - Accesibilidad Web (WCAG 2.1 AA)
- ✅ DL 1106 - Lavado de Activos (KYC, PEP screening)

---

## 📄 Licencia

Propietario - Canchero S.A.C.