# Despliegue de Canchero: Render + Vercel

Estado: configuracion validada localmente; el despliegue real en Render requiere
configurar el servicio y verificar su conectividad y variables privadas.
Render aloja la API Spring. Vercel aloja Angular. Supabase conserva la BD y Storage.
No ejecutar migraciones ni semillas automaticamente al arrancar el servicio.

Verificacion 2026-11-05: Maven verify117 pruebas correctas y JAR generado;
frontend266 pruebas, typecheck/build y seis pruebas de configuracion correctos.
Imagenes principal y de compatibilidad construidas localmente. Tras resolverse
la descarga inicial de Java, se retiro la precarga go-offline de complementos
innecesarios y se utiliza cache BuildKit para las dependencias Maven.

Contenedor probado con PostgreSQL16 temporal, sin Supabase, limitado a512MiB y1CPU:
puerto10000, usuario10001:10001, /health UP, ruta privada401 y CORS exacto correctos.
Al detener la BD temporal, /health responde503 en2.01segundos.
Los recursos temporales se limpiaron y el contenedor original del usuario sigue activo.
Es una prueba basica de arranque/salud, no una prueba de carga, esquema completo
ni conectividad desde Render. La configuracion real del dashboard sigue pendiente.

## 1. Verificar Localmente

Requisitos: Java21, Node compatible con package.json y Docker Desktop con motor Linux activo para probar la imagen.

Desde canchas-platform:

```powershell
npm ci
npm run test:env --workspace=apps/web
npm run lint:web
npm run test --workspace=apps/web -- --watch=false
npm run build:web
```

Desde canchas-platform/apps/api:

```powershell
.\mvnw.cmd verify
docker build -t canchero-api:local .
```

Para una prueba local del contenedor, preparar un archivo privado fuera del contexto de build.
No copiar todo .env.local al frontend ni incluir secretos en Dockerfile, ARG o repositorio.
Se puede ejecutar manualmente con docker run --env-file RUTA_PRIVADA -p 8080:8080 canchero-api:local.
No crear ventas de prueba en una BD compartida sin acuerdo del equipo.

## 2. Preparar GitHub, Sin Publicacion Automatica

Render construye desde la rama remota: no ve archivos que solo estan en esta computadora.
Revisar el diff, archivos nuevos y exclusiones de credenciales.
Solicitar autorizacion explicita antes de commit/push. Si Render tiene autodeploy activo,
un push a la rama conectada puede lanzar el despliegue automaticamente.

Nunca subir .env.local, environment.local.ts, respaldos de BD o configuraciones personales.
Mantener .env.example con valores ficticios. No publicar las filas reales del inventario.

## 3. Configurar el Backend en Render

Crear o revisar un Web Service Docker conectado al repositorio y rama autorizados.
No cambiar estos ajustes en un servicio existente sin comprobar cual Dockerfile usa.

Configuracion principal:

| Campo | Valor |
| --- | --- |
| Root Directory | canchas-platform/apps/api |
| Runtime | Docker |
| Dockerfile Path | ./Dockerfile |
| Docker Build Context | . |
| Docker Command | Vacio: usar ENTRYPOINT de la imagen |
| Health Check Path | /health |

Las rutas de Docker se interpretan respecto de Root Directory.
El Dockerfile funciona con Java21, normaliza mvnw a LF, copia solo la API
y ejecuta el JAR como usuario no root. Spring toma el PORT asignado por Render;
no fijar un puerto distinto en un comando manual.

Compatibilidad con un servicio antiguo: si Root Directory es canchas-platform,
usar ./Dockerfile y contexto . de esa carpeta. Ese archivo compila exactamente
la misma API con copias selectivas; .dockerignore excluye el resto del monorepo.
No usar el Dockerfile de apps/api con el contexto de la plataforma ni al reves.

### Variables del Backend

Configurar como variables privadas de Render, no en archivos versionados:

| Variable | Valor requerido |
| --- | --- |
| SPRING_DATASOURCE_URL | JDBC del Session Pooler, puerto5432, con SSL |
| SPRING_DATASOURCE_USERNAME | Usuario que aparece en Connect de Supabase |
| SPRING_DATASOURCE_PASSWORD | Contrasena de BD, no la clave anon |
| SUPABASE_JWT_SECRET | Secreto propio y estable de sesiones Canchero |
| CORS_ALLOWED_ORIGINS | Origen HTTPS exacto de tu frontend |
| DB_POOL_MAX_SIZE | 5 inicialmente; ajustar al presupuesto de conexiones |
| DB_POOL_MIN_IDLE | 1 inicialmente |

Ejemplo de formato, NO una direccion para copiar sin completar:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://HOST_SESSION_POOLER:5432/postgres?sslmode=require&connectTimeout=5&socketTimeout=20
SPRING_DATASOURCE_USERNAME=USUARIO_DEL_PANEL
SPRING_DATASOURCE_PASSWORD=CONTRASENA_PRIVADA
SUPABASE_JWT_SECRET=SECRETO_PROPIO_LARGO_Y_ESTABLE
CORS_ALLOWED_ORIGINS=https://TU-FRONTEND.vercel.app
DB_POOL_MAX_SIZE=5
DB_POOL_MIN_IDLE=1
```

Obtener host, usuario y puerto de Connect -> Session pooler del proyecto correcto.
No inventar region ni cambiar contrasena para adaptar un ejemplo.
No usar el Transaction Pooler6543 con esta configuracion JDBC sin revisar antes
prepared statements; el camino documentado aqui es Session Pooler5432.

SUPABASE_JWT_SECRET es el secreto del token propio de Canchero, no la clave
publishable/anon ni la service_role de Supabase. Mantenerlo estable entre reinicios.
Para generar uno nuevo en una instalacion nueva:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

No fijar SPRING_PROFILES_ACTIVE=dev: ese perfil usa H2.
No cambiar ddl-auto=none ni activar creacion de tablas al desplegar.
En produccion, preparar permisos JDBC minimos; no distribuir el usuario postgres
del proyecto a personas que solo necesitan utilizar la pagina.

### CORS

Solo admite origenes exactos separados por coma, sin comodines, rutas ni credenciales.
Ejemplo si tambien se permite deliberadamente desarrollo local:

```text
CORS_ALLOWED_ORIGINS=https://TU-FRONTEND.vercel.app,http://localhost:4200
```

Cada URL preview autorizada se agrega explicitamente. No usar https://*.vercel.app.
Si el frontend aun no existe, dejar solo el origen local y actualizarlo cuando se
conozca su dominio. No abrir CORS a todos los proyectos para evitar ese paso.

### Salud del Servicio

/ muestra un mensaje de bienvenida, NO verifica la BD.
/health ejecuta SELECT1 con timeout SQL de2segundos y devuelve solo:

- HTTP200: {"status":"UP"}.
- HTTP503: {"status":"DOWN"}.

La adquisicion de conexion se limita a2segundos. No revela detalles JDBC.
No cuenta ni lista reservas y no modifica datos. No certifica esquema,
permisos de negocio, pagos ni funcionamiento completo de la aplicacion.

## 4. Conectar Angular en Vercel

Seguir [la guia de Vercel](GUIA_VERCEL.md). Usar Root Directory
`canchas-platform`, Framework Preset `Other` y Node.js `24.x`.
El `vercel.json` de esa raiz define `npm ci`, `npm run build:web`,
salida `apps/web/dist/canchero/browser` y fallback para rutas SPA.
Asi se respeta el lockfile unico del workspace. No elegir `apps/web` como raiz.

Configurar variables publicas de build:

```text
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_ANON_KEY=CLAVE_PUBLICA_PUBLISHABLE_O_ANON
API_URL=https://TU-SERVICIO.onrender.com/api
GOOGLE_MAPS_API_KEY=CLAVE_PUBLICA_RESTRINGIDA_OPCIONAL
```

Nunca poner la contrasena PostgreSQL, SUPABASE_JWT_SECRET ni una clave secret/service_role en Vercel Angular.
API_URL debe ser HTTPS, publica, terminar en /api y no contener credenciales,
consulta ni fragmento. En Vercel/Render el build falla si falta o apunta a localhost.
Tras cambiar estas variables, recompilar/redeployar el frontend: estan integradas en el bundle.

## 5. Verificacion Posterior al Despliegue Autorizado

1. Confirmar logs sin secretos, puerto enlazado y /health HTTP200.
2. Consultar GET /api/venues como lectura de catalogo.
3. Comprobar /api/auth/me sin token: debe responder401.
4. Revisar el preflight desde el dominio real del frontend y rechazar un origen ajeno.
5. Probar login con cuenta autorizada y lectura de la sede propia.
6. Probar refresh de rutas SPA y confirmar que Network usa la API publica, no localhost.
7. Validar ventas, reservas y cierres solo con datos/entorno de prueba acordados.

Si falla el servicio, revisar logs de Render y Health Check antes de modificar Supabase.
La configuracion local comprobada no prueba conectividad desde la red de Render.

## Referencias Oficiales

- [Docker y rutas en Render](https://render.com/docs/docker)
- [Monorepos en Render](https://render.com/docs/monorepo-support)
- [Chequeos de salud](https://render.com/docs/health-checks)
- [Session Pooler para Spring Boot](https://supabase.com/docs/guides/getting-started/quickstarts/spring-boot)
