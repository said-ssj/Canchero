# Frontend Canchero en Vercel

Preparacion local: no implica que exista un proyecto o despliegue en Vercel.
El frontend se publica por separado de la API Spring de Render.

API existente: `https://canchero-api-givn.onrender.com`.
Para Vercel usar `API_URL=https://canchero-api-givn.onrender.com/api`.
El 2026-11-05 se comprobo `/health`: HTTP 200, `{"status":"UP"}`.
Esto comprueba disponibilidad y conexion de BD, no certifica todos los flujos.

## Importar el repositorio

1. En Vercel, crear un proyecto e importar `said-ssj/Canchero`.
2. Elegir la rama `main` y **Root Directory: `canchas-platform`**.
3. Elegir **Framework Preset: Other** y **Node.js: 24.x**.
4. Usar el `vercel.json` de esa carpeta. Define:

| Ajuste | Valor |
| --- | --- |
| Install Command | `npm ci` |
| Build Command | `npm run build:web` |
| Output Directory | `apps/web/dist/canchero/browser` |

No elegir `apps/web` como raiz: el lockfile y los workspaces estan en
`canchas-platform`. El archivo antiguo `apps/web/vercel.json` no es la
configuracion que se usa con esta raiz.

## Variables de compilacion

Configurar para Production antes del primer despliegue:

| Nombre | Obtener de | Observacion |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase, Connect / API | URL HTTPS del proyecto |
| `SUPABASE_ANON_KEY` | Supabase, Settings / API Keys | Solo publishable o anon publica |
| `API_URL` | URL publica del servicio API en Render | HTTPS y terminada en `/api` |
| `GOOGLE_MAPS_API_KEY` | Google Cloud, APIs & Services / Credentials | Opcional; restringir API y dominios autorizados |

Estos valores se incorporan al JavaScript descargado por los visitantes.
No copiar el `.env.local` completo. Nunca incluir usuario/contrasena JDBC,
`SUPABASE_JWT_SECRET`, `service_role` o `sb_secret_` en el frontend.
No introducir una direccion ficticia de Render para publicar: esperar su URL real.
El build de Vercel rechaza API_URL ausente, HTTP o localhost.

Tras cambiar variables hay que generar otro despliegue. Para Preview usar
un backend de prueba o autorizar expresamente el acceso al compartido;
no habilitar escrituras contra produccion inadvertidamente.

## Conectar Render y comprobar

1. Conocer la URL real de Render y comprobar `/health`.
2. Desplegar el frontend solamente cuando se autorice su publicacion.
3. Agregar el origen HTTPS exacto que Vercel asigne a
   `CORS_ALLOWED_ORIGINS` en Render. Conservar localhost solo si se necesita.
   No usar comodines `*.vercel.app`; previews requieren origen autorizado.
4. Abrir `/sedes`, `/login` y `/itinerario` directamente y refrescar.
   Las rutas privadas pueden llevar a login si no hay sesion.
5. Comprobar en Network que JS, CSS e imagenes cargan y que la API apunta
   a Render, sin localhost ni errores CORS. Probar login y datos de sede propia.
6. Probar movil y persistencia de sesion. Las operaciones de reserva, pago,
   POS y caja requieren datos de prueba acordados.

La reescritura SPA conserva las rutas de Angular; los archivos existentes
se sirven antes de aplicar el fallback a `index.html`.
`.vercelignore` limita subidas por CLI; no reemplaza `.gitignore` ni elimina
secretos ya publicados en Git. Este flujo recomendado importa desde GitHub.

## Referencias

- [Configuracion de Vercel](https://vercel.com/docs/project-configuration/vercel-json)
- [Configuracion de builds](https://vercel.com/docs/builds/configure-a-build)
- [Monorepos](https://vercel.com/docs/monorepos)
