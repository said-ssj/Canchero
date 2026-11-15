# Informe de revisión de seguridad de API

**Fecha:** 2026-11-13  
**Alcance:** inspección estática del backend y preparación de pruebas HTTP con Postman para el entorno local.  
**Objetivo probado:** ninguno. La API no estaba escuchando en `127.0.0.1:8090` ni `127.0.0.1:8080`. No se inició porque `.env.local` configura una base PostgreSQL externa y el backend podría consultar datos compartidos.

## Resultado ejecutivo

No se ejecutaron solicitudes HTTP, por lo que no hay vulnerabilidades confirmadas por prueba dinámica ni resultados de Postman que deban contarse como aprobados. La colección `postman/canchero-security.postman_collection.json` contiene 10 solicitudes de comprobación segura para ejecutar cuando se levante una instancia local con datos de prueba. La revisión de código encontró controles útiles de autenticación, tokens firmados, CORS de origen exacto y manejo acotado del estado de salud. También hay riesgos de configuración y cobertura que requieren validación antes de considerar la API auditada.

## Hallazgos de la revisión estática

### S1 — El secreto de firma debe tener entropía suficiente y estar presente en despliegue

**Severidad: Alta si se usa un secreto débil o reutilizado; no se confirmó la configuración desplegada.** `AuthTokenService` firma tokens de sesión con HMAC-SHA256 y rechaza el arranque si el secreto falta. El código no impone longitud ni entropía mínima. Un secreto predecible permitiría forjar sesiones. Ver `apps/api/src/main/java/pe/canchero/backend/service/AuthTokenService.java`.

**Acción:** usar un secreto aleatorio de al menos 32 bytes, único por entorno, almacenado en el gestor de secretos; verificar que no sea el secreto JWT de Supabase ni una clave publicada. No se leyó ni imprimió `.env.local`.

### S2 — Defensa contra fuerza bruta depende de la migración y la configuración del proxy

**Severidad: Media, pendiente de verificar en despliegue.** `LoginIpLimiter` bloquea tras 20 fallos en 15 minutos usando la tabla `login_intento_ip`; para confiar en `CF-Connecting-IP`, el proxy debe estar listado en `AUTH_TRUSTED_PROXY_CIDRS`. Con CIDR vacío usa la IP del socket, que es seguro ante suplantación directa del header, pero puede agrupar usuarios detrás de un proxy. La disponibilidad de la limitación depende de que tabla y permisos estén correctamente desplegados.

**Acción:** confirmar migración y permisos en el entorno operativo y probar el bloqueo desde una IP de prueba sin afectar cuentas reales.

### S3 — Falta evidencia dinámica de aislamiento entre sedes y roles

**Severidad: Alta por impacto potencial; no es una vulnerabilidad confirmada.** La documentación y el código delegan los permisos de negocio a `VenueAccessService`, pero la colección sin credenciales solo comprueba rechazo de sesión ausente. No puede probar IDOR/BOLA, privilegios de rol, acceso cruzado a sedes o límites de acceso de personal.

**Acción:** en un entorno aislado, crear dos sedes y usuarios de prueba con roles distintos; validar con solicitudes autenticadas que el usuario A no lea ni modifique registros de B al cambiar IDs de ruta, query y cuerpo.

### S4 — Endpoints públicos requieren revisión de minimización de datos

**Severidad: Media, requiere revisar respuestas reales.** El interceptor deja públicos los catálogos de sedes/canchas, reseñas y perfiles comunitarios públicos. Esa exposición puede ser intencional; no se comprobó si los JSON omiten datos personales, financieros o identificadores/códigos de terceros.

**Acción:** revisar muestras anonimizadas y probar explícitamente que respuestas públicas no contienen datos privados ni campos internos.

## Controles observados en código

- `AuthTokenService`: token propio con HMAC-SHA256, expiración de 15 minutos o 7 días, comparación de firma en tiempo constante y consulta de sesión/estado de usuario activo.
- `ApiAuthorizationInterceptor`: autenticación Bearer para rutas privadas y validación adicional de rol/adscripción para rutas de panel.
- `WebConfig`: CORS acepta orígenes HTTP/HTTPS exactos y rechaza comodines, credenciales o rutas en la configuración; permite credenciales para dichos orígenes.
- `HealthController`: responde `UP` o `DOWN` y registra categoría/SQLState acotados, sin devolver detalles de conexión al cliente.
- `ApiExceptionHandler`: transforma conflictos de integridad y errores numéricos en respuestas controladas.

Estos son controles leídos en el código; no equivalen a validación de su configuración ni comportamiento desplegado.

## Cobertura dinámica preparada

La colección cubre salud y filtrado de errores; catálogo público; 401 por ausencia de token en perfil, personal, usuarios, POS y escritura de sede; 401 ante token adulterado; y CORS desde origen configurado frente a origen ajeno. No ejecuta login, recuperación de contraseña, registro, cargas, pagos, creación o borrado de datos, ni operaciones con credenciales reales.

## Limitaciones y siguiente ejecución

Postman no se instaló ni descargó como aplicación. Se agregaron archivos estándar de colección y entorno, importables en Postman. La colección apunta a `http://localhost:8090`, puerto local del backend documentado. Para usarla con seguridad, levantar la API con perfil de pruebas y base aislada, importar ambos JSON y ejecutar la colección. Si se configura otro puerto, cambiar `baseUrl`. No agregar tokens reales al archivo de entorno ni guardar secretos en el repositorio.

Esta revisión no cubre frontend, dependencias, infraestructura, Supabase RLS, configuración TLS, límites de tamaño/rate limit generales, fuzzing, concurrencia ni pruebas autenticadas multiusuario. No se ejecutaron pruebas automatizadas del proyecto en esta revisión.
