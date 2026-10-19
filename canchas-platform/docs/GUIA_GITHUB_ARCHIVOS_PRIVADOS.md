# GitHub: exclusiones y revision antes de subir

Revision 2026-10-15. Guia, no comandos ejecutados ni certificacion de ausencia de secretos.

## Hallazgo local

La raiz Git es Canchero-Proyecto, no canchas-platform. No habia .gitignore en raiz al revisar; canchas-platform/.gitignore no protege carpetas hermanas. git ls-files encontro 20046 archivos rastreados bajo node_modules. Agregar un patron no deja de rastrear archivos existentes.

No ejecutar limpieza del indice mientras otro agente hace git add/commit. Los comandos siguientes son PowerShell, por bloques separados. No usar git rm sin --cached ni git rm -r --cached . como limpieza general de este worktree modificado.

## Que conservar

- package.json, package-lock.json, angular.json, tsconfig*.json y otros JSON de configuracion necesarios.
- README.md, instrucciones de equipo AGENTS.md, reglas de negocio, contratos, pruebas y documentacion tecnica sin secretos. Si se desea mantener algunas instrucciones privadas, excluirlas explicitamente; no todo *.md.
- .env.example solo con valores ficticios/placeholders; los secretos no deben estar ni en ejemplos.
- Migraciones SQL sin datos personales, Maven Wrapper y codigo fuente.
- Workspaces portables con rutas relativas pueden versionarse. Excluir los personales con rutas locales.
- MCP sin credenciales puede compartirse como plantilla; configuracion personal con tokens no. Un nombre/extension no permite detectar todos los secretos.

## 1. Ubicarse en la raiz y abrir .gitignore

```powershell
Set-Location 'C:\Users\alvar\Documents\Visual Studio Code\Clases\Hojas de Estilo en Cascada\Canchero-Proyecto'
notepad .gitignore
```

Agregar en ese archivo (NO ejecutar estos patrones como comandos):

```gitignore
# Credenciales y configuracion privada
.env
.env.*
!.env.example
!.env.*.example
*.local.json
*.local.yml
*.local.yaml
*.key
*.pem
*.p12
*.pfx
*.jks
*.keystore
.npmrc.local
.netrc
.git-credentials
secrets/
private/
# Herramientas personales de IA/MCP
.mcp.json
mcp.json
mcp_config.json
.vscode/mcp.json
.cursor/
.claude/
.gemini/
.agent/
.agents/
.codex/
# Dependencias, compilacion y resultados
node_modules/
.angular/
dist/
target/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
*.log
# Entorno local
*.code-workspace
.idea/
.DS_Store
Thumbs.db
# Respaldos y exportaciones privadas de BD
backups/
dumps/
*.dump
*.backup
```

Los patrones de herramientas excluyen tambien skills/reglas locales que podrian ser utiles al equipo; son una politica conservadora para este caso, no obligacion universal. No excluir *.json, *.md, *.sql ni *.yml globalmente. No excluir todos los JAR: Maven Wrapper puede necesitar su archivo versionado. Revisar .npmrc y configuracion Spring por contenido sin publicar tokens; no confiar solo en extensiones.

## 2. Instrucciones personales opcionales

Si se quiere que las instrucciones/prompts queden solo en esta maquina, abrir el archivo de exclusiones locales:

```powershell
notepad (git rev-parse --git-path info/exclude)
```

Agregar solo las rutas elegidas (no todas por defecto):

```gitignore
AGENTS.md
**/AGENTS.md
descargas/
canchas-platform/docs/PROMPT_*.md
canchas-platform/docs/ESTADO_ACTUAL.md
```

Esto no es necesario para seguridad si los documentos no contienen secretos. Compartir reglas tecnicas suele mejorar continuidad de agentes/equipo. Si se excluyen, un clon nuevo no las recibira: mantener copia privada segura. No excluir docs completos por defecto, pues contiene contratos y SQL requeridos.

## 3. Revisar antes de retirar del indice

```powershell
git check-ignore -v --no-index -- canchas-platform/.env.local
git ls-files -ci --exclude-standard
git status --short --untracked-files=no
```

git ls-files -ci enumera los ya rastreados que ahora coinciden con exclusiones. Revisar la lista localmente: no publicarla si revela nombres sensibles. Las reglas hijas pueden alterar el resultado; comprobar rutas concretas con check-ignore.

## 4. Dejar de rastrear sin borrar el archivo local

Cuando Antigravity no este modificando el indice, para node_modules primero simular:

```powershell
git rm -r -n --cached --ignore-unmatch -- ':(glob)**/node_modules/**'
```

Si la lista es correcta, ejecutar:

```powershell
git rm -r --cached --ignore-unmatch -- ':(glob)**/node_modules/**'
```

Para otro archivo concreto ya rastreado, ejemplo de credenciales locales:

```powershell
git rm --cached --ignore-unmatch -- canchas-platform/.env.local
```

Si Git rechaza por cambios staged, detenerse y revisar; no agregar -f automaticamente. No usar una limpieza masiva del indice ni borrar carpetas. Las eliminaciones staged de node_modules son esperadas: se elimina su seguimiento, no su copia en disco. Deben incluirse en un commit revisado para desaparecer de la version nueva en GitHub.

## 5. Preparar solo lo revisado

```powershell
git add -- .gitignore
git diff --cached --stat
git diff --cached --name-only
```

Revisar tambien contenido de los archivos staged en una herramienta local; nombres/estadisticas no detectan secretos. Agregar codigo de forma selectiva, no git add . a ciegas. No se recomienda push automatico en esta guia. Configurar deteccion de secretos de GitHub cuando este disponible y usar escaneo local antes del primer push.

## Si un secreto ya fue publicado

Ignorar/dejar de rastrear no borra commits anteriores. Revocar/rotar inmediatamente la credencial comprometida y revisar historial/accesos; coordinar limpieza de historial antes de force-push, sin reescribir trabajo ajeno automaticamente. Un repositorio privado tampoco vuelve seguro almacenar contrasenas.

Fuentes: https://git-scm.com/docs/gitignore y https://git-scm.com/docs/git-rm.
