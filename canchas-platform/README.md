# Canchero — Plataforma Deportiva (Módulo Platform)

Sistema integral de reservas deportivas, catálogo de canchas, administración de sedes y control de caja de mostrador.

---

## 🛠️ Requisitos del Entorno

- **Node.js**: `v22.22.3`, `v24.15.0+` o `>=26.0.0` (Recomendado: `v24.19.0` o superior).
- **npm**: `11.17.0`
- **Java**: **JDK 21** (Eclipse Temurin / OpenJDK).
- **Base de Datos**: PostgreSQL alojado en Supabase con el esquema relacional configurado.

---

## ⚙️ Configuración de Credenciales (`.env.local`)

1. Crea el archivo privado desde el ejemplo solo si no existe; no sobrescribas una configuracion funcional:
   ```powershell
   # PowerShell, desde canchas-platform:
   if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
   ```
2. Completa los valores de tu entorno en `.env.local`:
   ```ini
   # --- Frontend (Angular) ---
   SUPABASE_URL="https://tu-proyecto.supabase.co"
   SUPABASE_ANON_KEY="tu-clave-anon-publishable"
   GOOGLE_MAPS_API_KEY=""

   # --- Backend (Spring Boot) ---
   SPRING_DATASOURCE_URL="jdbc:postgresql://HOST_DEL_PANEL:PUERTO_DEL_PANEL/postgres?sslmode=require"
   SPRING_DATASOURCE_USERNAME="USUARIO_DEL_PANEL"
   SPRING_DATASOURCE_PASSWORD="tu-password"
   SUPABASE_JWT_SECRET="SECRETO_PROPIO_ESTABLE_DE_CANCHERO"
   ```

> **Aviso de Seguridad:** Nunca subas `.env.local` a Git. Este archivo se encuentra protegido por `.gitignore`. Tampoco expongas la clave `service_role` de Supabase al frontend.

Copia host, puerto y usuario desde Connect del proyecto correcto (Session pooler si necesitas IPv4). `SUPABASE_JWT_SECRET` es un nombre heredado para la firma de sesiones propias de Canchero; no requiere rotar claves de Supabase. El esquema de BD debe existir previamente: el backend no lo crea y este repositorio aun no incluye una inicializacion completa de una base vacia.

---

## 💻 Comandos de Desarrollo

### Frontend (`apps/web`)

| Tarea | Comando desde `canchas-platform/` | Descripción |
| --- | --- | --- |
| **Instalación** | `npm install` | Instala dependencias del monorepo mediante npm workspaces |
| **Desarrollo** | `npm run dev:web` | Inicia servidor de desarrollo Angular en `http://localhost:4200` |
| **Verificación TypeScript** | `npm run lint:web` | Comprueba app y pruebas con sus tsconfig explicitos; no sustituye lint de estilo ni build Angular |
| **Pruebas Unitarias** | `npm run test:web` | Ejecuta las pruebas con Vitest |
| **Compilación Producción**| `npm run build:web` | Genera bundle optimizado en `apps/web/dist/canchero` |

### Backend (`apps/api`)

| Tarea | Comando | Descripción |
| --- | --- | --- |
| **Arranque Seguro (Recomendado)** | `.\scripts\start-api.ps1` | Carga `.env.local`, normaliza JDBC y arranca Spring Boot en `http://localhost:8080/api` |
| **Validar Configuración** | `.\scripts\start-api.ps1 -ValidateOnly` | Comprueba variables sin arrancar el proceso |
| **Pruebas Automatizadas** | `cd apps/api && .\mvnw.cmd test` | Ejecuta pruebas JUnit 5 aisladas con H2 en memoria |
| **Empaquetado JAR** | `cd apps/api && .\mvnw.cmd package -DskipTests` | Genera el artefacto ejecutable en `apps/api/target/` |

---

## 🔒 Modelo de Seguridad y Autorización

- **Aislamiento Multi-Tenant**: Toda mutación sobre reservas, canchas, sedes o caja requiere que el usuario autenticado sea titular de la sede (`s.id_dueno = authUser.id`). Intentos de acceso cruzado devuelven `403 Forbidden`.
- **Cancelaciones de Jugador**: Los jugadores solo pueden cancelar reservas donde su ID coincide estrictamente con `id_usuario` de la reserva.
- **Arqueo de Caja**: No se aceptan saldos esperados enviados por el cliente. Por seguridad, un turno con ventas activas no puede cerrarse hasta disponer de desglose de pagos persistido: sumar todas las ventas como efectivo produciria faltantes falsos. El modelo de pagos y su conciliacion completa siguen pendientes de BD.
- **Privacidad de Pases y Reseñas**: Los endpoints públicos no exponen información financiera ni códigos de canje de terceros.

---

## 📑 Documentación Adicional

- [Arquitectura del Sistema](docs/ARQUITECTURA.md)
- [Contratos de API REST](docs/CONTRATOS_API.md)
- [Diccionario y Esquema de Base de Datos](docs/BASE_DE_DATOS.md)
- [Flujos de Estados y Negocio](docs/FLUJOS_Y_ESTADOS.md)
- [Guía de Credenciales y Servicios](docs/GUIA_CREDENCIALES_Y_SERVICIOS.md)
- [Matriz de Verificación y Pruebas](docs/VERIFICACION.md)
