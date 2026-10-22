# Guia de credenciales y servicios de Canchero

Revision: 2026-10-17, America/Lima. Inventario contrastado con el codigo activo y documentacion oficial. Las pantallas de los proveedores pueden cambiar de nombre.

Esta guia no contiene valores reales. No se leyeron archivos privados de credenciales, no se crearon claves y no se modificaron cuentas. Una variable en `.env.example` no demuestra que exista una integracion funcional.

## 1. Que necesitas ahora

| Servicio o dato | Estado en el proyecto | Destino |
| --- | --- | --- |
| URL de Supabase y clave publica | Consumidos por Angular | Configuracion publica del frontend |
| Conexion PostgreSQL: URL JDBC, usuario y contrasena | Consumidos por Spring | Solo backend |
| Secreto de firma de sesiones de Canchero | Consumido por Spring | Solo backend |
| Google Maps: clave para navegador | Opcional; utilizada por los mapas que la requieren | Frontend, restringida por sitio y API |
| Supabase Storage | Existe helper de subida; bucket y permisos deben verificarse | Mismo proyecto Supabase, politicas propias |
| GitHub, Figma y MCP | Herramientas de desarrollo, no requisitos del login | Gestor de credenciales o conexion de cada herramienta |
| Culqi, SUNAT, Twilio, SendGrid, FCM, Sentry, Grafana | Variables historicas de plantilla, sin integracion activa localizada en la revision | No configurar como si estuvieran operativos |

No necesitas contratar ni activar todos los servicios de la ultima fila para ejecutar Canchero.

## 2. Donde colocar la configuracion local

Carpeta activa de la plataforma:

```text
C:\Users\alvar\Documents\Visual Studio Code\Clases\Hojas de Estilo en Cascada\Canchero-Proyecto\canchas-platform
```

Archivo privado de configuracion: `.env.local` dentro de esa carpeta, no dentro de `apps/web` ni del prototipo HTML/CSS de Downloads.

Ejemplo de nombres y formato, con marcadores que debes reemplazar localmente. No sobrescribas una configuracion que ya funciona:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=CLAVE_PUBLICA_DEL_PROYECTO

SPRING_DATASOURCE_URL=jdbc:postgresql://HOST_COPIADO_DEL_PANEL:5432/postgres?sslmode=require
SPRING_DATASOURCE_USERNAME=postgres.PROJECT_REF
SPRING_DATASOURCE_PASSWORD="CONTRASENA_DE_BASE_DE_DATOS"
SUPABASE_JWT_SECRET="SECRETO_PRIVADO_ESTABLE_DE_CANCHERO"

# Opcional para los mapas que utilizan Google Maps:
GOOGLE_MAPS_API_KEY=CLAVE_DE_NAVEGADOR_RESTRINGIDA
```

El host, puerto y usuario son ejemplos de Session pooler: copia los de TU proyecto. No reutilices el host de otra persona ni cambies de region para imitar un ejemplo.

El frontend carga este archivo mediante `apps/web/scripts/load-env.mjs` y genera `apps/web/src/environments/environment.local.ts`. No edites el generado a mano. Solo URL, clave publica y clave de Maps deben llegar alli.

El script `scripts/start-api.ps1` importa cuatro variables: `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` y `SUPABASE_JWT_SECRET`. No importa automaticamente todos los servicios de esta guia. Spring no lee `.env.local` por si solo.

Los alias `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_GOOGLE_MAPS_API_KEY` se aceptan por compatibilidad, pero el proyecto activo es Angular. Usa un solo nombre por dato para evitar discrepancias. Una variable del proceso puede prevalecer sobre el archivo.

## 3. Supabase: URL y clave publica

1. Abre el [panel de Supabase](https://supabase.com/dashboard) y selecciona el proyecto correcto.
2. En **Settings > API Settings**, busca la URL del proyecto. Tambien puedes verla en los ejemplos de **Connect > Framework**.
3. En **Settings > API Keys**, busca la clave **Publishable** (`sb_publishable_...`). Si el proyecto conserva claves heredadas, la publica se llama **anon**.
4. Coloca la URL en `SUPABASE_URL` y la clave publica en `SUPABASE_ANON_KEY`. El nombre de la variable se conserva aunque uses una publishable moderna.

NO copies **Secret**, `sb_secret_...` ni **service_role** en Angular. La clave publica identifica al proyecto y no sustituye permisos ni autenticacion. [Tipos de claves](https://supabase.com/docs/guides/getting-started/api-keys), [URL y configuracion API](https://supabase.com/docs/guides/api/quickstart).

`SUPABASE_SERVICE_ROLE_KEY` aparece en la plantilla historica, pero no se encontro como requisito del backend actual. No la agregues para resolver un error del navegador: es una credencial privilegiada.

## 4. Supabase: conexion de la base de datos

Esta es la pantalla de **Connect > Direct** que mostraste. No es la misma seccion que API Keys.

1. Entra al proyecto y pulsa **Connect**.
2. Abre **Direct / Connection string** y selecciona **Session pooler** si tu conexion local es IPv4.
3. Selecciona el formato JDBC si esta disponible, o abre **Connection parameters**.
4. Copia `host`, `port`, `database` y `user`. En el pooler el usuario suele ser `postgres.PROJECT_REF`; no lo reemplaces automaticamente por `postgres`.
5. Construye la URL JDBC con esos parametros y usa la contrasena de la base de datos en la variable separada.

```dotenv
SPRING_DATASOURCE_URL=jdbc:postgresql://HOST:PUERTO/BASE_DE_DATOS?sslmode=require
SPRING_DATASOURCE_USERNAME=USUARIO_COPIADO_DEL_PANEL
SPRING_DATASOURCE_PASSWORD="CONTRASENA_DE_LA_BASE_DE_DATOS"
```

Session pooler permite conexiones persistentes desde redes IPv4; la conexion directa puede requerir IPv6. No cambies a Transaction pooler solo porque aparezca primero: sus condiciones son distintas. [Conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres).

La contrasena es la definida al crear/configurar la base de datos. No es la de tu cuenta Supabase ni la de un usuario de Canchero. Si no la conservas, el panel ofrece **Reset database password**, pero restablecerla obliga a actualizar los consumidores: no hacerlo sin coordinarlo.

No incrustes usuario o contrasena en la URL JDBC. El helper actual espera credenciales separadas. La codificacion porcentual es relevante cuando una contrasena forma parte de una URI; no codifiques automaticamente la variable separada del driver. Ante fallo de autenticacion, revisa proyecto, usuario y contrasena antes de restablecer nada. [Diagnostico oficial](https://supabase.com/docs/guides/troubleshooting/fatal-password-authentication-failed).

## 5. Secreto de las sesiones de Canchero

IMPORTANTE: `SUPABASE_JWT_SECRET` tiene un nombre heredado confuso. `AuthTokenService.java` lo utiliza para firmar las sesiones propias de Canchero; no debes asumir que esta pidiendo una clave de Supabase Auth.

Para un entorno NUEVO, genera un secreto aleatorio independiente mediante un gestor de contrasenas, preferiblemente de al menos 32 bytes de entropia. Guardalo en el gestor y en la configuracion privada del backend. No uses un nombre, correo, contrasena de usuario o texto de ejemplo. Esa longitud es una recomendacion de configuracion, no una validacion actualmente implementada.

Para el entorno EXISTENTE, conserva el secreto estable. Cambiarlo invalida las sesiones firmadas y requiere coordinacion; esta guia no propone rotarlo. No hace falta obtener ni rotar las signing keys de Supabase para este servicio.

La propiedad de codigo es `app.auth.token-secret`, con respaldo en `SUPABASE_JWT_SECRET`. El arranque local suministrado usa este ultimo nombre. `JWT_SECRET` y `JWT_EXPIRATION` de la plantilla historica no configuran este flujo actual.

## 6. Google Maps

1. Abre [Google Cloud Console](https://console.cloud.google.com/) y selecciona el proyecto correspondiente.
2. En **APIs & Services > Library**, habilita las APIs que realmente utilice la implementacion, empezando por Maps JavaScript API. Verifica Geocoding para el flujo de geocodificacion utilizado.
3. En **APIs & Services > Credentials > Create credentials > API key**, crea o localiza la clave de navegador.
4. Restringela por **Websites / HTTP referrers** y por las APIs necesarias. Incluye el origen local de desarrollo y, por separado, el dominio real autorizado.
5. Colocala en `GOOGLE_MAPS_API_KEY` y reinicia el frontend.

La clave del navegador sera visible al usuario: las restricciones son indispensables. No uses una clave de servidor sin restricciones. Revisa facturacion, cuotas y alertas antes de habilitar servicios con coste. [Obtener la clave](https://developers.google.com/maps/documentation/javascript/get-api-key), [restricciones recomendadas](https://developers.google.com/maps/api-security-best-practices).

## 7. Storage: fotos de sedes, canchas y QR de cobro

1. En Supabase abre tu proyecto y entra en **Storage**.
2. Localiza el bucket utilizado por la aplicacion; revisa su nombre, si es publico o privado y sus limites de archivo/MIME.
3. Revisa las politicas de `storage.objects` antes de permitir subidas, reemplazos o eliminaciones.

No existe una contrasena distinta por foto o bucket. Se usa el proyecto Supabase y la autorizacion de Storage. Un bucket publico permite servir archivos publicamente, no autoriza automaticamente subirlos o borrarlos. [Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [control de acceso](https://supabase.com/docs/guides/storage/security/access-control).

El helper actual intenta `canchero-media`, `canchero-assets`, `sedes`, `imagenes` y `public`. Eso NO confirma cual existe o tiene permisos correctos. Antes de completar el QR de cobro hay que elegir un bucket explicito y rutas separadas por propietario/sede/medio; la BD guardaria la referencia, no la imagen base64.

La sesion propia de Spring no equivale automaticamente a una sesion de Supabase Auth. No supongas que `auth.uid()` reconoce el token de Canchero: la subida necesita un backend autorizado o una integracion de identidad compatible. No abrir escrituras anonimas globales ni poner service_role en el navegador para evitar este trabajo.

El QR publico de la sede se genera desde su enlace; el QR de cobro Yape/Plin seria una imagen aportada por el dueno. Para guardar una imagen no necesitas la clave bancaria, PIN, contrasena ni codigos SMS. Mostrar el QR no valida pagos automaticamente. Esta integracion de cobro sigue pendiente.

## 8. Herramientas de desarrollo, no variables de la aplicacion

### GitHub

Preferir inicio de sesion del gestor de credenciales, OAuth o SSH para Git. Si una herramienta exige token: **GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens**. Limita repositorios, permisos y vencimiento; no usar la contrasena de GitHub como token. No guardarlo en `.env.local` del producto ni en la URL del remoto. [Guia oficial de tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

### Supabase MCP

Configura el conector en la herramienta de desarrollo y completa su autorizacion oficial. El servidor remoto admite OAuth; no se necesita pegar la contrasena PostgreSQL en el chat. Empieza por acceso de solo lectura limitado al proyecto:

```text
https://mcp.supabase.com/mcp?project_ref=PROJECT_REF&read_only=true
```

La URL es configuracion, no una credencial. No habilites escrituras solo para inspeccionar el esquema. Revisa permisos y evita conectar produccion para tareas experimentales. [MCP oficial de Supabase](https://supabase.com/docs/guides/ai-tools/mcp).

### Figma

Usa la conexion/autorizacion que solicite el conector instalado. Para clientes REST que lo exijan, Figma documenta OAuth y personal access tokens; estos ultimos se administran desde los ajustes de cuenta. No son variables de Angular. Una nueva clave no elimina limites de plan, permisos del archivo ni cuotas. [Autenticacion oficial](https://developers.figma.com/docs/rest-api/authentication/).

## 9. Servicios pendientes de la plantilla

Estas rutas sirven para una futura integracion autorizada. Poner claves en el archivo NO implementa cobros, comprobantes, mensajes ni notificaciones. Los nuevos nombres/lectores deben definirse al integrar cada proveedor.

| Servicio | Donde obtener los datos | Variables historicas y precauciones |
| --- | --- | --- |
| Culqi | CulqiPanel > Desarrollo / API Keys; separar pruebas de produccion | `CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY`. Privada solo backend. `CULQI_WEBHOOK_SECRET` es un marcador: no asumir que el prefijo `whsec_` de la plantilla corresponde al proveedor. Verificar el mecanismo real de webhooks al implementar. [Llaves](https://docs.culqi.com/es/documentacion/pagos-online/llaves). |
| SUNAT | SOL > administracion de usuarios secundarios, con permisos especificos | `SUNAT_RUC`, `SUNAT_USER`, `SUNAT_PASSWORD`, `SUNAT_ENDPOINT`. No entregar la Clave SOL principal. RUC no es secreto; credenciales/certificados privados si. Los ejemplos beta no son acceso a produccion. [Usuarios secundarios](https://orientacion.sunat.gob.pe/07-creacion-de-usuario-secundarios-de-la-clave-sol). |
| Twilio / WhatsApp | Twilio Console > Dashboard / Account Info; despues configurar remitente autorizado | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`. Credenciales solo servidor; no confundir el numero sandbox con un remitente de produccion. Evaluar API keys limitadas al integrar. [API keys](https://www.twilio.com/docs/iam/api-keys). |
| SendGrid / correo | Settings > API Keys; Settings > Sender Authentication para verificar remitente o dominio | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`. Permiso minimo de envio. Escribir un correo en la variable no lo verifica ni activa los correos. [Claves](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys), [dominio](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication). |
| Firebase / FCM | Firebase Console > Project settings > Service accounts | `FCM_SERVER_KEY` es una referencia heredada, no un diseno recomendado para una integracion nueva. Usar HTTP v1 y credenciales de servidor mediante ADC/cuenta de servicio; cualquier JSON con clave privada queda fuera del repositorio. `FCM_SENDER_ID` no sustituye autorizacion. [Autenticacion HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api). |
| Sentry | Seleccionar proyecto en Sentry y su configuracion de SDK/DSN | `SENTRY_DSN` identifica el destino de eventos; no es equivalente a un token administrativo. Si se configura subida de sourcemaps, el token de autenticacion es otro secreto y pertenece al entorno de build, no al navegador. [Documentacion](https://docs.sentry.io/), [tokens API](https://docs.sentry.io/api/auth/). |
| Grafana | Administration > Users and access > Service accounts > token | `GRAFANA_API_KEY` es un nombre historico: para nuevas configuraciones usar tokens de cuenta de servicio con alcance minimo. No exponerlos en Angular. [Cuentas de servicio](https://grafana.com/docs/grafana/latest/administration/service-accounts/). |

No hay una necesidad general de una API key de Gemini, Antigravity u OpenAI para ejecutar Canchero en el codigo revisado. Esos accesos, si se usan para desarrollo, se configuran en sus propias herramientas; no agregarlos a la aplicacion por costumbre.

## 10. Comprobacion local sin revelar secretos

Desde la carpeta `canchas-platform`, en PowerShell:

```powershell
.\scripts\start-api.ps1 -ValidateOnly
```

Valida la configuracion de arranque sin imprimir credenciales; NO demuestra que la BD sea accesible ni que la contrasena sea correcta. Para arrancar realmente la API, con Java 21 configurado, usa otra ejecucion:

```powershell
.\scripts\start-api.ps1
```

Para Angular, en una segunda terminal:

```powershell
Set-Location .\apps\web
npm start
```

El `prestart` carga las variables publicas. Tras cambiarlas, reinicia el proceso. Si el puerto esta ocupado, no lances instancias duplicadas sin comprobar la existente.

El destino de API actual esta en `apps/web/src/environments/environment.ts`: `http://localhost:8080/api`. `VITE_API_URL` de la plantilla NO lo cambia. `DATABASE_URL` tampoco sustituye automaticamente las variables `SPRING_DATASOURCE_*` del arranque documentado.

### Como interpretar fallos

| Sintoma | Que revisar primero |
| --- | --- |
| Frontend no inicia por variables ausentes | `.env.local` en raiz de plataforma, nombres soportados y valores no marcadores |
| Error JDBC / password authentication failed | Proyecto, Session pooler, usuario exacto, contrasena DB y red |
| Login dice correo o contrasena incorrectos | Cuenta y hash de usuario del backend Canchero; no usar password DB ni clave anon como contrasena |
| Sesion deja de ser valida tras reiniciar API | Estabilidad del secreto de firma; no generar otro en cada arranque |
| Storage devuelve 401/403 | Identidad y politicas de bucket, no solo existencia de clave publica |
| Mapa muestra error de clave/referer | Proyecto Cloud, API habilitada, restricciones, facturacion y consola del navegador |
| Carga de datos lenta | Medir peticiones y tiempos API/BD; no asumir que cambiar claves arregla consultas lentas |

## 11. Que nunca compartir o subir

No publiques `.env.local`, contrasenas DB, secretos de sesiones, claves secret/service_role, tokens personales/MCP, JSON de cuentas de servicio, certificados/llaves privadas ni copias de BD. No pegues sus valores en chats, capturas, logs o documentos de contexto para IA.

La clave publica Supabase y la clave Maps de navegador se incorporan al frontend por diseno, pero esto no vuelve publicos los otros secretos. Protege los datos con permisos/RLS y restringe Maps. Tampoco incluyas valores reales en esta guia ni en `.env.example`.

Para comprobar exclusion y rastreo sin mostrar contenidos, desde `canchas-platform`:

```powershell
git check-ignore -v -- .env.local apps/web/src/environments/environment.local.ts
git ls-files -- .env.local apps/web/src/environments/environment.local.ts
```

El primer comando identifica reglas de exclusion; el segundo no debe listar archivos privados rastreados. `.gitignore` no retira del historial un archivo ya subido. Si hubo exposicion, coordina revocacion/rotacion con el proveedor y saneamiento del historial; borrar el archivo no basta. Esta guia no ejecuta esas operaciones.

Guarda el respaldo en un gestor de contrasenas o secretos. Documenta nombre del servicio, proyecto/entorno, responsable, permisos, vencimiento y ubicacion segura del secreto, nunca su valor. Separa desarrollo y produccion.

## 12. Lista de preparacion

- [ ] Proyecto Supabase correcto identificado, sin mezclar entornos.
- [ ] URL y clave publica configuradas; ninguna clave privilegiada en Angular.
- [ ] Conexion JDBC y credenciales DB conservadas en privado.
- [ ] Secreto de sesion estable respaldado, sin rotarlo por accidente.
- [ ] Maps restringido si se utiliza, con cuotas y facturacion revisadas.
- [ ] Bucket y autorizacion de Storage revisados antes de nuevas subidas.
- [ ] Archivos privados excluidos y no rastreados por Git.
- [ ] Servicios pendientes permanecen sin habilitar hasta implementar y verificar su flujo.

Fuentes locales revisadas: `.env.example`, `apps/web/scripts/load-env.mjs`, `apps/web/package.json`, `apps/web/src/environments/environment.ts`, `apps/api/src/main/resources/application.yml`, `scripts/start-api.ps1`, `AuthTokenService.java` y helper `uploadPublicImage` de `database.service.ts`. La revision documental no certifica credenciales reales, politicas remotas ni integraciones de produccion.
