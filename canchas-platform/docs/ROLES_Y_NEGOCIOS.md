# Negocios, propietarios y personal por sede

Implementado en Supabase el 8 de noviembre de 2026. Migracion estructural:
`sql/2026-11-07_negocios_roles_sede.sql`. Ejecutar una sola vez en una BD nueva;
no volver a ejecutarla en el proyecto compartido. No incluye cuentas ni contrasenas.

## Modelo

- `usuario.id_rol` conserva la identidad general. `user`, `cliente` y
  `userPremium` siguen siendo jugadores; Premium no tiene beneficios adicionales.
- `negocio` tiene un propietario UUID y agrupa varias sedes. Inicialmente existe
  un negocio por propietario, con `UNIQUE(id_dueno)`.
- `sede.id_negocio` y `sede.id_dueno` deben coincidir con la misma fila de negocio.
  `id_dueno` se conserva para compatibilidad; un trigger sincroniza el negocio y
  crea la membresia del propietario al registrar o transferir una sede.
- `miembro_negocio` vincula una cuenta con un negocio. No convierte al empleado
  en propietario ni cambia su rol personal.
- `asignacion_sede` asigna roles operativos por sede a un miembro. Permite varios
  roles por persona y diferentes roles en distintas sedes.
- Las claves foraneas compuestas impiden mezclar miembros y sedes de diferentes
  negocios. Una transferencia con asignaciones existentes se rechaza hasta
  resolver esas asignaciones; no las transfiere automaticamente.
- `rol_sede`, `permiso_sede` y `rol_sede_permiso` contienen la matriz operativa.

## Responsabilidades

| Rol | Alcance |
|---|---|
| superadmin | Plataforma y usuarios; unico rol global. No se creo una cuenta superadmin en esta entrega. |
| dueno | Todas las sedes de su negocio; propiedad, operacion y personal. |
| admin | Solo sedes asignadas; coordinacion, finanzas y personal operativo. No transfiere propiedad, elimina sedes ni administra usuarios globales. |
| cajero | Cobros, ventas y operacion de su propio turno en las sedes asignadas. No ingresa mercaderia ni modifica el catalogo. |
| ayudante | Agenda sin datos financieros, verificacion de pases e incidencias. Sin caja, cancelaciones ni inventario. |
| almacen | Catalogo, categorias, precios e ingresos de mercaderia de las sedes asignadas. Sin caja ni ventas. |

Un texto `admin`, `cajero`, `ayudante` o `almacen` en `usuario.id_rol` no otorga
acceso por si solo: se requiere una asignacion activa. Las asignaciones tambien
funcionan para cuentas cuyo rol personal sigue siendo `cliente`/`user`.

## API y seguridad

`TenantPermissions` consulta `public.tiene_permiso_sede(usuario, sede, permiso)`.
El usuario se obtiene de la sesion autenticada; no del cuerpo de la peticion.
Se validan usuario, rol, propietario, negocio, sede, membresia y asignacion activos.
La revocacion es efectiva en la siguiente consulta, sin esperar a renovar el token.

Se adaptaron las reservas, canchas, horarios, caja, catalogo, inventario, ventas
y reportes. Los listados sin sede tambien se filtran por permisos. Un cajero no
puede usar el turno de otro usuario, aunque ambos trabajen en la misma sede.
Los reintentos de ventas existentes conservan su comprobacion de identidad y sede.

Las seis tablas nuevas tienen RLS y carecen de acceso para `anon` y
`authenticated`. Las funciones tampoco son RPC publicas. El backend JDBC sigue
siendo la frontera de autorizacion: usa credenciales confiables y debe llamar a
las comprobaciones; habilitar RLS no restringe por si solo al usuario PostgreSQL.
No se abrieron escrituras directas desde el navegador.

Los esquemas antiguos sin la funcion solo admiten propiedad real con rol de
dueno, o superadmin. No se conceden permisos de empleados por compatibilidad.

## Administracion del personal desde la API

Todas estas rutas requieren un Bearer token valido:

| Metodo y ruta | Accion |
|---|---|
| GET `/api/team/me` | Sedes y permisos efectivos de la cuenta autenticada. |
| GET `/api/team/venues/{id}/agenda` | Agenda sin importes, saldos ni informacion de pago. |
| GET `/api/team/venues/{id}/members` | Asignaciones de la sede; requiere `personal.gestionar`. |
| POST `/api/team/venues/{id}/members` | Asignar a una cuenta existente un rol operativo en esa sede. |
| DELETE `/api/team/assignments/{id}` | Revocar una asignacion sin eliminar la cuenta ni su historial. |

Cuerpo de ejemplo para POST (correo ilustrativo):

```json
{ "email": "empleado@example.com", "rol": "cajero" }
```

Solo se aceptan `admin`, `cajero`, `ayudante` y `almacen`. Esta ruta no permite
asignar `dueno`/`superadmin` ni cambiar el rol general. Una membresia inactiva
requiere revision del propietario: asignar una sede no reactiva de forma
indirecta los permisos antiguos de otras sedes.

La pantalla de altas/asignaciones de empleados queda pendiente. Estos endpoints
y permisos ya estan disponibles para integrarla; no se crearon empleados de muestra.
La vista global del frontend queda reservada a `superadmin`.

## Datos existentes y cuentas de prueba

Con autorizacion del usuario se crearon 11 cuentas de prueba de propietario y
se distribuyeron las 42 sedes sin dueno restantes, con 3 o 4 sedes por cuenta.
El propietario original conserva la sede 54 y recibe Santo Domingo, sede 1;
su rol pasa de `admin` a `dueno`. Su contrasena no se modifica.
Quedan 12 propietarios, 12 negocios y 44 sedes vinculadas. No se modificaron
reservas, ventas, existencias ni pagos historicos.

El reparto y el respaldo previo se guardan solo en `backups/`, excluido de Git.
Las claves de las cuentas de prueba no se incluyen en esta documentacion publica.
Las cuentas estan en `public.usuario`, para el login actual de la API; no se
crearon identidades Google ni cuentas adicionales en `auth.users`.

## Verificacion

`TenantRolesPostgresTest` aplica este SQL en un PostgreSQL local temporal y
comprueba propietarios separados, permisos por rol, roles distintos por sede,
revocacion, claves compuestas, negocios inactivos, aislamiento de reservas/caja,
ventas de un cajero solo en su turno y autorizacion HTTP con rol personal cliente.
Las pruebas no insertan reservas ni empleados ficticios en Supabase compartido.

Los cambios de backend necesitan reinicio local y un despliegue separado para
Render. Esta entrega no implica commit, push ni despliegue automatico.

Resultado: 197 pruebas API y 306 web correctas, sin pruebas API omitidas; build web correcto. En Supabase: 44 sedes autorizadas para su propietario y cero accesos cruzados. HTTP local con dos cuentas nuevas: login/alcances propios correctos y seis comprobaciones de aislamiento correctas. API local reiniciada; Render pendiente.
