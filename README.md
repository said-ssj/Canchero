# Canchero — Plataforma Deportiva

Plataforma monorepo para la reserva de canchas deportivas, gestión de sedes, control de caja de mostrador (POS), reservas e inventario deportivo.

---

## 🏗️ Arquitectura y Estructura del Proyecto

El proyecto está organizado en una arquitectura de monorepo desacoplada dentro del directorio `canchas-platform`:

```
Canchero-Proyecto/
├── .github/
│   └── workflows/
│       └── ci.yml             # Pipeline de Integración Continua (CI)
├── canchas-platform/          # Directorio activo de la plataforma
│   ├── apps/
│   │   ├── web/               # Frontend SPA (Angular 22 + Angular Material + Vitest)
│   │   └── api/               # Backend REST (Spring Boot 3.4 + Java 21 + Maven Wrapper)
│   ├── packages/
│   │   └── types/             # Definiciones TypeScript compartidas
│   ├── scripts/
│   │   └── start-api.ps1      # Script PowerShell seguro para arranque del backend
│   ├── docs/                  # Documentación de arquitectura, contratos API y flujos
│   ├── .env.example           # Plantilla de variables de entorno (sin credenciales)
│   └── package.json           # Manifiesto raíz del workspace npm
├── .gitignore                 # Reglas estrictas de exclusión de secretos y temporales
└── README.md
```

> **Nota:** Las carpetas `canchero-frontend` y `canchero-backend` corresponden a antecedentes históricos descartados y han sido excluidas de la entrega activa.

---

## 📋 Requisitos Previos

Antes de inicializar la aplicación, asegúrate de contar con las siguientes herramientas instaladas en tu entorno:

1. **Node.js**: `v22.22.3`, `v24.15.0+` o `>=26.0.0` (Recomendado: **Node 24 LTS**).
2. **npm**: `11.17.0` (o versión 11 compatible).
3. **Java Development Kit (JDK)**: **Java 21** (Eclipse Temurin / OpenJDK 21).
4. **Instancia de Base de Datos**: Proyecto de Supabase con PostgreSQL activo y las tablas del esquema configuradas.

---

## 🚀 Guía Rápida de Inicio para Desarrolladores

Para que cualquier miembro del equipo clone e inicie el proyecto localmente, sigue estos pasos:

### 1. Clonar el repositorio y configurar variables de entorno
```bash
git clone <URL_DEL_REPOSITORIO>
cd Canchero-Proyecto/canchas-platform
```

Copia la plantilla `.env.example` y renómbrala a `.env.local`:
```bash
cp .env.example .env.local
```

Edita `.env.local` con las credenciales de tu proyecto Supabase:
- `SUPABASE_URL`: URL HTTPS de tu proyecto (`https://<project-ref>.supabase.co`).
- `SUPABASE_ANON_KEY`: Clave pública (publishable / anon) de Supabase para el cliente web.
- `SPRING_DATASOURCE_URL`: Cadena JDBC de PostgreSQL (`jdbc:postgresql://<host>:5432/postgres` o session pooler).
- `SPRING_DATASOURCE_USERNAME`: Usuario de la base de datos (típicamente `postgres`).
- `SPRING_DATASOURCE_PASSWORD`: Contraseña asignada a la base de datos.
- `SUPABASE_JWT_SECRET`: Secreto privado de firma JWT para validación de tokens en backend.

*(Para más detalles sobre la obtención de cada variable, consulta [GUIA_CREDENCIALES_Y_SERVICIOS.md](canchas-platform/docs/GUIA_CREDENCIALES_Y_SERVICIOS.md)).*

### 2. Instalar dependencias del frontend
Desde la carpeta `canchas-platform`:
```bash
npm ci
```

### 3. Iniciar el Frontend (Angular)
```bash
npm run dev:web
```
El cliente web estará disponible en **`http://localhost:4200`**.  
*(El script previo carga de forma segura las variables públicas desde `.env.local` al entorno de Angular).*

### 4. Iniciar el Backend (Spring Boot API)
Desde `canchas-platform`, ejecuta el script PowerShell incluido:
```powershell
.\scripts\start-api.ps1
```
La API REST estará disponible en **`http://localhost:8080/api`**.

---

## 🧪 Pruebas y Validación Automatizada

El proyecto cuenta con cobertura de pruebas unitarias y de aislamiento en ambas capas:

| Capa | Comando | Cobertura / Alcance |
| --- | --- | --- |
| **Frontend** | `npm run test:web` | **266 pruebas** (26 suites) en Vitest validando checkout, cotización, auth y vistas admin. |
| **Frontend Lint** | `npm run lint:web` | Chequeo estático de tipos TypeScript (`tsc --noEmit`). |
| **Frontend Build** | `npm run build:web` | Compilación optimizada para producción con presupuestos de rendimiento. |
| **Backend** | `npm run test:api` (o `cd apps/api && ./mvnw test`) | **110 pruebas** (16 suites) en JUnit 5 con base de datos H2 en memoria para aislamiento multi-tenant, roles y seguridad de caja. |

### Integración Continua (CI)
El archivo [`.github/workflows/ci.yml`](.github/workflows/ci.yml) ejecuta automáticamente en cada `push` y `pull_request` a `main` y `master`:
- Validación y build de frontend con Node 24.
- Ejecución completa del test suite con Vitest.
- Validación y ejecución de pruebas del backend con OpenJDK 21 y Maven.

---

## 📌 Estado de Entrega y Consideraciones de Producción

1. **Estado del Software**: Proyecto en fase de consolidación funcional.
2. **Flujos de Pago**: Los pagos con tarjeta online operan en modo simulado para pruebas de experiencia de usuario y validación de turnos. No existe integración en vivo con pasarelas de pago externas ni emisión fiscal SUNAT.
3. **Esquema de Base de Datos**: El backend de Spring Boot se ejecuta con `ddl-auto=none` y asume que las tablas y funciones relacionales ya existen en Supabase.

### Avance del 19 de octubre de 2026

Esta entrega es un avance de desarrollo, no una version certificada para produccion.

- Incluye persistencia de pagos POS por medio, pagos mixtos, reintentos sin duplicacion y conciliacion de caja calculada en servidor. Las operaciones no se presentan como guardadas si falla la API.
- La migracion de pagos fue aplicada en el entorno de desarrollo autorizado. No ejecutarla otra vez alli. En otro proyecto, revisar primero [pagos y caja](canchas-platform/docs/PAGOS_Y_CAJA.md); estas migraciones incrementales NO inicializan toda la BD desde cero.
- El inventario inicial se administra por sede. Se incluye una [plantilla sin datos reales](canchas-platform/docs/ALTA_INVENTARIO_SQL.md); no se publica una exportacion de productos, clientes ni operaciones.
- Pendientes: ingreso cotidiano de mercaderia desde la interfaz, filtros POS alineados con categorias reales, pruebas integrales de venta/cierre/reserva y aislamiento entre sedes en un entorno controlado.
- Tambien quedan pendientes la inicializacion completa reproducible de la BD y una revision integral de permisos/RLS, almacenamiento y restauracion de respaldos.
- Las pruebas locales no sustituyen la ejecucion de GitHub Actions ni certifican cobros bancarios, pagos online reales o emision fiscal.
