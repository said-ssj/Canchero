# Calidad y pruebas de Canchero

Guía de la tarea del 17/11/2026: depuración de caja negra y caja blanca, Lighthouse, Playwright, PageSpeed y respaldos.
Todos los comandos se ejecutan desde `canchas-platform/`.

## 1. Depuración y pruebas: caja blanca y caja negra

El profesor lo planteó con Laravel, pero el backend de Canchero es **Spring Boot (Java 21)**. Estas son las herramientas equivalentes:

| Enfoque | Qué se mira | Herramienta en Canchero |
|---|---|---|
| Caja blanca | El código interno: ramas, condiciones y SQL | JUnit 5 + MockMvc (`apps/api/src/test`) y Vitest (`apps/web/src/**/*.spec.ts`). Depurador del IDE con puntos de interrupción |
| Caja negra | Solo la entrada HTTP y la salida, sin mirar el código | `scripts/caja-negra.sh` (curl), Postman, Playwright |
| Caja gris | Se conoce el diseño (roles, permisos), pero se prueba desde fuera | Tests `it/Postgres*Test` (aislamiento entre sedes con una BD real) |

### Caja blanca
- Todos los tests: `npm run test:api` y `npm run test:web`.
- Un solo test: `cd apps/api && ./mvnw test -Dtest=AuthControllerTest`.
- **Depurar paso a paso el API.** Ejecuta `cd apps/api && ./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005"`. Después conecta el IDE con *Remote JVM Debug* al puerto 5005, pon un punto de interrupción en el controlador (por ejemplo `AuthController.login`) y haz la petición desde la web o con curl.
- **Depurar el frontend.** Usa Chrome DevTools: en *Sources* pon puntos de interrupción en los `.ts` (los source maps están activos con `npm run dev:web`). En *Network* revisa las llamadas a `/api`.

### Caja negra
`scripts/caja-negra.sh [URL_API]` envía 10 peticiones y compara el código HTTP con el esperado: endpoints públicos, rutas protegidas sin token, token falso y login inválido.

**Hallazgo (19/11/2026).** `POST /api/auth/login` con el cuerpo `{}` respondía **500** en vez de 400. La causa era un `NullPointerException` en `AuthService.login`. Se corrigió en `AuthController` validando el correo y la contraseña antes de consultar la BD. El test de caja blanca `AuthControllerTest.rejectsEmptyLoginWithBadRequestWithoutReadingDatabase` cubre este caso. La API de Render seguirá dando 500 hasta que se despliegue el arreglo.

## 2. Lighthouse por módulo

`node scripts/rendimiento.mjs lighthouse` ejecuta Lighthouse 12 en local, con el Chromium de Playwright, sobre 7 páginas públicas en móvil y escritorio. El resultado queda en `reportes/lighthouse-<fecha>/`: `resumen.md` y un HTML por página, que se abre en el navegador. Para medir otro sitio, usa `BASE_URL=http://localhost:4200`.

También se puede hacer de forma manual: Chrome → F12 → pestaña **Lighthouse** → *Analyze page load*, página por página (en una ventana de incógnito para que no interfieran las extensiones).

Medición del 19/11/2026 sobre https://canchero-iota.vercel.app (una sola corrida, valores de laboratorio):

| Página | Modo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|---|
| / | mobile | 76 | 95 | 96 | 100 | 2.9 s | 4.4 s | 90 ms | 0.002 |
| / | desktop | 97 | 95 | 96 | 100 | 0.7 s | 0.9 s | 0 ms | 0.002 |
| /buscar | mobile | 79 | 93 | 96 | 92 | 2.6 s | 4.2 s | 90 ms | 0.002 |
| /buscar | desktop | 86 | 93 | 96 | 92 | 1.4 s | 1.7 s | 0 ms | 0.002 |
| /sedes | mobile | 66 | 96 | 96 | 92 | 3.6 s | 5.3 s | 210 ms | 0.013 |
| /sedes | desktop | 93 | 96 | 96 | 92 | 1.1 s | 1.3 s | 10 ms | 0.004 |
| /itinerario | mobile | 78 | 94 | 96 | 92 | 2.7 s | 4.4 s | 90 ms | 0.001 |
| /itinerario | desktop | 97 | 94 | 96 | 92 | 0.8 s | 1.0 s | 0 ms | 0 |
| /login | mobile | 80 | 100 | 100 | 92 | 2.6 s | 4.1 s | 80 ms | 0 |
| /login | desktop | 96 | 100 | 100 | 92 | 0.7 s | 1.0 s | 0 ms | 0.046 |
| /registro | mobile | 75 | 94 | 96 | 92 | 2.9 s | 4.4 s | 100 ms | 0.003 |
| /registro | desktop | 95 | 94 | 96 | 92 | 0.9 s | 1.2 s | 10 ms | 0.001 |
| /ayuda | mobile | 75 | 96 | 96 | 92 | 2.9 s | 4.5 s | 110 ms | 0.017 |
| /ayuda | desktop | 97 | 96 | 96 | 92 | 0.7 s | 1.0 s | 0 ms | 0.004 |

Valores de laboratorio (una sola corrida); repetir 3 veces y promediar antes de concluir.

**Lectura.** En escritorio el rendimiento es bueno (86–97). En móvil queda en 66–80; el peor caso es `/sedes`, que carga todas las sedes con sus fotos en una sola lista. Accesibilidad, buenas prácticas y SEO están en 92–100. Las páginas de `/admin` necesitan sesión: para medirlas, inicia sesión y usa la pestaña Lighthouse de DevTools en esa misma ventana.

## 3. Playwright: capturas y depuración de cada página

```bash
cd apps/web
npx playwright install chromium     # solo la primera vez
npm run e2e                          # URL pública, escritorio + móvil (Pixel 7)
BASE_URL=http://localhost:4200 npm run e2e
E2E_EMAIL=dueno@... E2E_PASSWORD=... npm run e2e   # incluye las 13 páginas de /admin
npx playwright show-report e2e/reporte
```
Por cada página, el reporte HTML guarda una **captura de pantalla completa** y un `*-debug.txt` con:
- el tiempo de carga;
- los errores y advertencias de la consola;
- las peticiones fallidas y las respuestas HTTP ≥ 400.

El test falla si la página lanza errores JavaScript no capturados. Cuando un test falla, también se guarda la *trace* (`npx playwright show-trace`). Archivos: `apps/web/playwright.config.ts` y `apps/web/e2e/capturas.e2e.ts`.

Resultado del 19/11/2026: las 10 páginas públicas pasaron sin errores JS, en escritorio y en móvil.

## 4. PageSpeed Insights (pagespeed.web.dev)

**Manual.** Abre https://pagespeed.web.dev, pega `https://canchero-iota.vercel.app` y luego cada ruta (`/sedes`, `/buscar`, ...). Guarda la pestaña *Móvil* y la de *Escritorio*. A diferencia de Lighthouse local, PageSpeed también muestra **datos de campo (CrUX)**, pero solo cuando el sitio tiene tráfico suficiente; si no, indica *"No hay datos"*. En ese caso no se pueden citar Core Web Vitals reales, solo valores de laboratorio.

**Automático.** `PSI_API_KEY=... node scripts/rendimiento.mjs pagespeed` genera la misma tabla que Lighthouse. Sin clave, la cuota anónima de Google está agotada (error 429). Para crear la clave: Google Cloud Console → habilitar *PageSpeed Insights API* → Credenciales → *Crear clave de API*. Es gratis.

## 5. Respaldos (backups)

Las migraciones de `docs/sql/` solo **recrean la estructura**, no los datos. El plan gratuito de Supabase no ofrece respaldos descargables ni restauración a un punto en el tiempo, así que los datos se respaldan con `pg_dump`:

```bash
scripts/backup-db.sh
# → backups/canchero-AAAAMMDD-HHMM.dump  (esquema public completo: usuarios, sedes, reservas, caja, POS...)
scripts/restore-db.sh backups/canchero-XXXX.dump "postgresql://usuario:clave@host:5432/bd"
```
- `backup-db.sh` lee `SPRING_DATASOURCE_*` de `.env.local`, usa SSL, guarda el archivo con permisos 600 y conserva los 14 respaldos más recientes. Usa el pooler en *session mode* (puerto 5432), no el 6543.
- `restore-db.sh` nunca usa `.env.local`, para no sobrescribir producción por error, y pide escribir `RESTAURAR` antes de empezar. Si el destino es un Postgres sin Supabase, crea antes los esquemas `auth`/`extensions`, los roles `anon`/`authenticated` y las extensiones necesarias.
- **Verificado el 19/11/2026.** Se hizo un respaldo de 1,6 MB con 84 tablas con datos y se restauró en un Postgres 17 local: 434 usuarios, 49 sedes y 317 reservas.
- **No incluye:** `auth.users` de Supabase (solo se usa para enlazar Google) ni las fotos de Supabase Storage. Las fotos se descargan desde el panel de Supabase → Storage, o con `supabase --experimental storage cp -r ss:///<bucket> ./backups/storage`.
- **Programarlo** (Linux, diario a las 3:00): `crontab -e` → `0 3 * * * cd /ruta/canchas-platform && scripts/backup-db.sh >> backups/cron.log 2>&1`.
- La carpeta `backups/` contiene datos personales: está en `.gitignore` y **no debe subirse al repositorio**. Guarda una copia fuera de la máquina, por ejemplo en un Drive privado.
