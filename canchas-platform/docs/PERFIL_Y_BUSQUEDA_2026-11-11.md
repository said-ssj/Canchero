# Perfil y búsqueda: implementación local del 11 de noviembre de 2026

## Implementado

- `/buscar?q=...` es una página Angular independiente, con fuentes `apps/web/src/app/features/jugador/buscar/buscar.ts`, `buscar.html` y `buscar.css`. La búsqueda global deja de usar la pantalla de sedes para presentar resultados.
- Pestañas Todo, Sedes, Canchas y Personas; conteos del catálogo y de la respuesta real de personas, hasta 50 personas. Presentación progresiva con Ver más, estados de error parciales y protección frente a respuestas antiguas. La consulta de personas usa nombre e identificador; nunca correo o teléfono. No se inventan dueños, identificadores, fotografías, valoraciones ni disponibilidad a partir de sedes.
- Perfil propio con Vista propia/Vista de visitante. La propiedad se compara por identidad; la vista previa no modifica rol ni permisos. No permite seguir/reportar/bloquear la propia cuenta. Al fallar la API se muestra error sin generar un perfil de muestra.
- Presentación y edición personal se pueden abrir/cerrar y son excluyentes. Campos Material, separación del compositor, iconos compactos sin marcos y temas compartidos. El avatar permite Cambiar en hover, foco o toque únicamente en vista propia.
- La presentación muestra foto personal y portada en pequeño, permite elegir JPG, PNG o WebP y optimiza las imágenes antes de guardar por la API autenticada. La foto personal nunca se sustituye por una foto de sede. Guardar datos personales no publica automáticamente el teléfono privado como WhatsApp.
- El identificador se guarda únicamente mediante un diálogo de confirmación que avisa del bloqueo por tres meses. El servidor toma la cuenta de la sesión. El plazo se aplica en PostgreSQL por trigger, con índice único, bloqueo de fila y meses calendario en America/Lima. Guardar otras preferencias no reinicia el plazo. No se importaron antiguos identificadores de localStorage ni se asignaron identificadores a usuarios reales.
- Skill local: `C:/Users/alvar/.agents/skills/canchero-ui/SKILL.md`, validada con quick_validate.py. Incluye Material/Google Icons, sin hover visual por defecto, iconos transparentes y área de clic del tamaño del icono, foco visible y excepción explícita para Cambiar foto.

## Base de datos y conexión local

Migración `supabase/migrations/20261111090000_identificador_perfil.sql` aplicada en Supabase. Verificación posterior: columnas y trigger presentes; RLS conservado y sin UPDATE para anon/authenticated. No repetir la migración en la misma base. Se conserva el resto de datos.

Durante la verificación el pooler de sesión rechazó conexiones con EMAXCONNSESSION (límite 15). Se verificó la conexión al mismo proyecto mediante pooler de transacción y se dejó `.env.local` con puerto 6543, `prepareThreshold=0`, `DB_POOL_MAX_SIZE=2` y `DB_POOL_MIN_IDLE=0`. El arranque PowerShell carga ambas opciones del pool. Este cambio es local, privado y no modifica Render ni publica credenciales. API 8090: /health UP y búsqueda pública HTTP 200 tras el cambio.

## Verificado y límites

- 20 pruebas backend focalizadas: autorización, HTTP de comunidad y PostgreSQL real. Incluyen propiedad, fotos, privacidad del buscador, unicidad, validación de formato, plazo, cambios simultáneos y conservación de RLS. Todas aprobadas, sin omisiones.
- 16 pruebas frontend de perfil, diálogo, búsqueda y página de resultados. Typecheck y compilación de producción aprobados.
- Navegador local: perfil propio, presentación, cambio a visitante y retorno, diálogo sin guardar un identificador real, búsqueda global hacia la nueva ruta, resultados reales, tema claro/oscuro y ancho móvil. Candado medido en el centro del campo; botón de perspectiva de 22 px; Cambiar foto visible con foco de teclado. Capturas en C:/Users/alvar/Documents/Codex/artifacts/canchero-busqueda-final.png y canchero-presentacion-perfil.png.
- La compilación mantiene avisos previos por presupuesto del bundle inicial y jsqr CommonJS. Esta entrega no equivale a aprobación de toda la suite del proyecto.
- No se modificó la foto, portada, identificador, nombre ni publicaciones de usuarios reales para probar. No se realizó commit, push ni despliegue.

## Pendiente de publicación

Los cambios son locales. Vercel/Render seguirán sirviendo sus versiones publicadas hasta una entrega autorizada. Las mejoras generales de notificaciones, privacidad configurable y otras operaciones que estaban pendientes no se dan por implementadas en esta entrega.
