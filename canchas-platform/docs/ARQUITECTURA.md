# Arquitectura de Canchero

Revision documental: 2026-10-13. Describe el codigo inspeccionado y el objetivo acordado por separado.

## Responsabilidades objetivo
- Angular: vistas, formularios, estado de interaccion y mensajes de carga/error.
- Angular Material/CDK: controles, accesibilidad y overlays. No es otro framework separado de Angular.
- Spring Boot: autenticar peticiones, autorizar por dueno/sede, validar reglas y coordinar transacciones.
- PostgreSQL de Supabase: persistencia de operaciones y restricciones de integridad.
- Supabase Storage: archivos y sus permisos. Guardar la referencia del archivo en el registro correspondiente.
- Signals: estado de pantalla. HttpClient/RxJS: solicitudes. Componentes con inputs/outputs tipados.

## Situacion actual
DatabaseService mezcla llamadas HTTP a Spring Boot, consultas directas a Supabase y datos de localStorage.
Actualizacion 2026-10-15: AuthService usa exclusivamente la autenticacion existente del backend para login/registro/restauracion. Ya no restaura perfiles demo ni usa Supabase Auth como fallback silencioso. El cache conserva token, pero no acredita identidad: /auth/me debe validarlo antes de exponer usuario o abrir admin. El cliente Supabase sigue presente en datos/Storage y para cerrar sesiones historicas; no es un acceso alternativo.
El backend usa mayormente JdbcTemplate en SupabaseDataService; existe dependencia JPA pero no debe suponerse una arquitectura de repositorios JPA.
Actualizacion 2026-10-15: AdminLayout y ocho rutas hijas son el admin activo; AdminContext coordina identidad, sede y carga. El antiguo Admin queda como compatibilidad, no como shell activo. Separar componentes no ha eliminado todas las reglas CSS superpuestas ni terminado los contratos de negocio.

## Direccion de correccion
Operacion de negocio: interfaz -> API autenticada -> permisos y validacion -> transaccion -> respuesta -> actualizar interfaz.
No confirmar una venta antes de persistirla ni reenviarla por otra via sin control de duplicados.
Catalogos publicos y operaciones privadas deben tener contratos y permisos distintos.
El mecanismo activo conserva el contrato propio de Spring (token firmado y usuario de public.usuario). Una migracion futura a Supabase Auth/Spring Security no esta realizada ni debe introducirse como fallback automatico. Actualizacion 2026-10-15: PasswordUtil verifica bcrypt existente mediante spring-security-crypto y genera bcrypt coste 12 para nuevas altas. SHA-256 prefijado se conserva solo para verificar cuentas antiguas, sin migracion automatica. La dependencia crypto no agrega filtros Spring Security. No se certifica seguridad integral por corregir el verificador.

## Limites de los componentes
Cada funcionalidad debe tener pagina, componentes, modelos y servicios acotados.
Compartir componentes solo por reutilizacion real. No crear una abstraccion por cada boton.
Formularios tipados; evitar IDs DOM como contrato entre plantilla y logica.
Usar MatDialog/CDK para overlays. No colocar contenido arbitrario fuera de las zonas proyectadas de mat-sidenav-container.

## Tiempo, dinero e identidad
- Moneda PEN; interfaz S/. No usar numeros de punto flotante como solucion definitiva para contabilidad.
- Objetivo tecnico: importes decimales exactos en servidor/BD y criterio unico de redondeo documentado antes de migrar calculos. Hoy hay double/number; no afirmar exactitud contable.
- Zona de negocio America/Lima. Separar fecha de reserva, hora local e instante de auditoria.
- Horarios que cruzan medianoche requieren fecha final correcta, no solo comparar cadenas de horas.
- Usuarios usan UUID en el esquema de referencia; sedes/canchas usan IDs numericos. Hay compatibilidad legacy que mezcla tipos y debe consolidarse.
- Identidad del operador desde la sesion verificada, no desde el cuerpo de la peticion.
