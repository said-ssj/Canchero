# Guia de edicion de Canchero

Actualizada el 15 de octubre de 2026 a partir del codigo vigente. Guia practica para retomar Angular sin cambiar accidentalmente la logica del proyecto.

## 1. Abre la aplicacion correcta

El frontend activo esta en `canchas-platform/apps/web`. El backend esta en `canchas-platform/apps/api`.
La carpeta hermana `canchero-frontend` es otra aplicacion: editarla no modifica automaticamente esta web.

Todas las rutas de archivos de esta guia son relativas a `apps/web`, salvo indicacion contraria.

Antes de trabajar revisa el README publico de la plataforma. Si trabajas en el entorno del equipo, consulta tambien sus instrucciones, estado y reglas locales; esos documentos privados no son requisitos incluidos en un clon publico.

## 2. HTML, CSS y TypeScript

Biblioteca visual v1: [Figma y correspondencia con Angular Material](../../docs/SISTEMA_DISENO_FIGMA.md). Es una especificacion editable; no sustituye los componentes ni aplica automaticamente sus colores. Consultar la guia antes de importar o crear otro CSS global.

| Archivo | Para que sirve | Ejemplo |
| --- | --- | --- |
| `.html` | Contenido y estructura de la pantalla | Cambiar el texto de un boton |
| `.css` | Apariencia y distribucion | Ancho de foto, espacios, bordes |
| `.ts` | Datos, eventos y comportamiento | Guardar una sede o abrir un formulario |

Angular Material aporta controles dentro de Angular; no es una segunda aplicacion.
Un `mat-card` sigue teniendo una plantilla y estilos del proyecto.

En un componente, `templateUrl` indica su HTML y `styleUrl` su CSS.
`{{ sede().nombre }}` muestra un dato: cambia el registro mediante su formulario, no lo sustituyas por un nombre fijo para todas las sedes.
`[src]` enlaza la imagen y `(click)` conecta una accion. No los borres al cambiar el aspecto.

## 3. Que archivos se usan actualmente

Consulta [app.routes.ts](src/app/app.routes.ts) antes de elegir una carpeta.
En esta revision `/admin` carga `AdminLayout` (`features/admin/layout/admin-layout.ts`), el cual actúa como cascarón común (sidebar, header, selector de sede y perfiles) y enruta a cada pantalla modular mediante rutas hijas lazy-loaded:

- `/admin` redirige automáticamente a `/admin/sedes`.
- Cada módulo es autónomo, enrutable directamente y respaldado por sus servicios reactivos (`DatabaseService`, `AuthService`, `CajaService`, `PosService`).
- Las rutas no reciben automaticamente los inputs del viejo Admin. `features/admin/admin-context.service.ts` proporciona propietario, sede y carga/error compartidos; no reemplazarlo por IDs fijos.
- Una pantalla modular no implica persistencia terminada. Consultar ESTADO_ACTUAL antes de habilitar botones grises. No usar localStorage para fingir operaciones guardadas.
- Si Caja, Finanzas o Personalizacion muestran que falta una sede, revisar identidad/propiedad, no quitar el filtro ni poner sede 1. La presentacion compartida esta en `features/admin/components/venue-required/`. El perfil demo no equivale a la cuenta real del dueno.

| Que quieres editar | Donde buscar |
| --- | --- |
| Inicio | `src/app/features/jugador/home/` |
| Sedes publicas | `src/app/features/jugador/sedes/` |
| Detalle publico | `src/app/features/jugador/detalle/` |
| Pago / reserva | `src/app/features/jugador/checkout/` |
| Itinerario | `src/app/features/jugador/itinerario/` |
| Login / registro | `src/app/features/jugador/auth/` |
| Cascarón, header y barra lateral de Admin | `src/app/features/admin/layout/admin-layout.{ts,html,css}` |
| Tarjeta de sede del admin | `src/app/features/admin/components/sede-card/` |
| Accion agregar sede/cancha | `src/app/features/admin/components/add-action/` |
| Mi Sede: listado, formulario y mapa | `src/app/features/admin/sedes/admin-sedes.{ts,html,css}` |
| Mis Canchas: losas, horarios y cierres | `src/app/features/admin/canchas/admin-canchas.{ts,html,css}` |
| Reservas & Operaciones: turnos, pases y cobros | `src/app/features/admin/reservas/admin-reservas.{ts,html,css}` |
| Caja Operativa & Arqueo físico de billetes | `src/app/features/admin/caja/admin-caja.{ts,html,css}` |
| Punto de Venta (POS) & Kardex de inventario | `src/app/features/admin/pos/admin-pos.{ts,html,css}` |
| Finanzas & Liquidación bancaria | `src/app/features/admin/finanzas/admin-finanzas.{ts,html,css}` |
| Personalización & Código QR vectorial oficial | `src/app/features/admin/personalizacion/admin-personalizacion.{ts,html,css}` |
| Configuración General, Alertas y Seguridad | `src/app/features/admin/configuracion/admin-configuracion.{ts,html,css}` |
| Tema general | `src/styles/tema.css` y entrada `src/styles.css` |

## 4. Por que aparecen varios CSS

Hay tres responsabilidades distintas:

- Tema global: colores, fuentes y reglas comunes.
- Variables del admin: valores reutilizados, como ancho de foto de sede.
- CSS local: como se distribuyen la foto, texto y botones de un componente.

Por ejemplo, `styles/personalizacion.css` define `--ui-sede-photo-width` y `components/sede-card/sede-card.css` utiliza ese valor. Eso no significa que debas cambiar ambos.
En `var(--ui-sede-photo-width, 200px)`, `200px` es el valor alternativo si la variable no esta definida. Cambiar solo ese alternativo no afecta a una variable ya definida.

`admin.css` importa las hojas `styles/01-base.css` a `13-horarios.css` y finalmente `personalizacion.css`. Todavia existen ajustes superpuestos: no agregues otra regla al final sin localizar primero la que realmente se aplica.
Usa Inspeccionar > Estilos/Computed en el navegador para ver la regla ganadora. No soluciones cada conflicto agregando `!important`.

Durante la migracion, sedes y canchas importan algunas hojas compartidas del admin. Para cambios exclusivos de una cancha, usa `canchas/admin-canchas.css`; no dupliques sus reglas en `admin.css`. `styles/04-canchas.css` queda como referencia de traslado, sin las reglas antiguas. La consolidacion de los estilos compartidos sigue pendiente.

## 5. Cambiar solo el ancho de la foto de una sede

Abre [personalizacion.css](src/app/features/admin/styles/personalizacion.css).
Modifica la declaracion existente dentro de `.mat-admin-shell`, por ejemplo:

```css
--ui-sede-photo-width: 180px;
```

Actualmente vale `200px`. Esto cambia la columna de foto de las tarjetas de sede del admin; no cambia la imagen almacenada ni la foto de la pagina publica.
La imagen ocupa esa columna con `object-fit: cover`: mantiene proporcion y recorta lo sobrante.

Otros valores existentes:

| Variable | Valor actual | Efecto |
| --- | --- | --- |
| `--ui-sede-max-width` | `1180px` | Ancho maximo de la tarjeta |
| `--ui-sede-height` | `160px` | Altura minima, no altura fija |
| `--ui-sede-title-size` | `20px` | Tamano del titulo |
| `--ui-sede-description-lines` | `2` | Lineas visibles de descripcion |
| `--ui-add-action-height` | `72px` | Altura minima de la accion agregar |

Reducir la altura minima no obliga a que el contenido quepa: textos, botones y padding pueden requerir mas espacio. No uses una altura fija que corte botones.
En pantallas de hasta `640px`, `sede-card.css` establece una columna de `88px`; revisa esa media query si quieres modificar tambien el ancho movil.

## 6. Cambiar la foto de una cancha

La tarjeta activa esta en [admin-canchas.html](src/app/features/admin/canchas/admin-canchas.html). Su distribucion horizontal esta en [admin-canchas.css](src/app/features/admin/canchas/admin-canchas.css).
Busca esta regla existente y cambia solo la primera medida:

```css
.mat-admin-shell .cancha-card {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  /* Conservar las demas propiedades existentes. */
}
```

Por ejemplo, `160px minmax(0, 1fr)` da menos ancho a la foto y deja el resto para la informacion. El bloque anterior es un fragmento explicativo, no reemplaza toda la regla.
La imagen se controla con `.cancha-card-image > img`; conserva `width: 100%`, `height: 100%` y `object-fit: cover` para llenar su contenedor sin deformarla.
`cover` recorta; `contain` muestra la foto entera pero puede dejar espacios libres. `object-position` permite ajustar que zona queda visible sin cambiar la foto original.
La regla movil de hasta `640px` usa `88px` para la columna. Comprueba escritorio y movil por separado.

Este cambio es visual: no toca precios ni fotos almacenadas. El boton Horarios aun abre la configuracion por sede; la configuracion independiente por cancha sigue pendiente.

La consulta de reservas ya se edita en su carpeta. El registro presencial esta temporalmente deshabilitado: falta integrar nombre/telefono del cliente sin cuenta, adelantos y confirmacion remota. No habilites el antiguo formulario de admin.html: su guardado fue bloqueado para impedir asociar reservas a jugadores ajenos.

## 7. Textos, botones y formularios

- Para cambiar "Ver Canchas" o "Editar" de una sede, abre `components/sede-card/sede-card.html` y conserva sus eventos.
- Para cambiar la presentacion de "Agregar", revisa `components/add-action/`. Los textos de sedes y canchas llegan desde `sedes/admin-sedes.html` y `canchas/admin-canchas.html`.
- Para cambiar un campo, conserva `formControlName`, enlaces y validaciones. Una etiqueta no debe reemplazar el nombre del control.
- Los textos de negocio guardados en la base de datos se editan mediante el flujo correspondiente, no con CSS.

Un control pendiente de implementar debe estar gris y realmente deshabilitado. No habilites un boton cuyo metodo este vacio.
Solo las acciones habilitadas muestran cursor de mano. Conserva el foco visible para teclado.

Para un textarea: `resize: vertical`, ancho limitado a su contenedor y `box-sizing: border-box`. Primero localiza su regla; no agregues bordes tanto al campo como a su envoltorio Material.

## 8. Estilo acordado

- Plus Jakarta Sans para texto; Material Symbols Outlined para los iconos Google existentes.
- Bordes finos, radios habituales de 6 a 8px, sin marcos duplicados ni botones gigantes.
- Sin cambios visuales al pasar el cursor, brillos, elevacion o animaciones decorativas no solicitadas.
- No aplicar la fuente del texto a `mat-icon`.
- Skeletons solo durante la carga real; error y lista vacia son estados diferentes. No crear paginas nuevas para agregar skeletons.

Consulta las reglas de construccion para el detalle. Que exista un estilo antiguo no significa que cumpla las reglas.

## 9. Rutina para editar sin perderte

1. Comprueba la ruta y el componente que renderizan lo que ves.
2. Revisa los cambios existentes con Git o el historial del editor; no descartes trabajo ajeno.
3. Cambia una propiedad o un bloque pequeno por vez.
4. Guarda y comprueba la pantalla, incluyendo textos largos y ancho movil.
5. Prueba las acciones cercanas: un cambio visual no debe tapar botones ni impedir clics.
6. Ejecuta el build y revisa errores. Compilar no demuestra que se guarden datos.
7. Registra que cambiaste y que comprobaste en `docs/ESTADO_ACTUAL.md` del proyecto activo.

Desde `canchas-platform/apps/web`, en PowerShell:

```powershell
npm run start
```

Usa la URL que muestre el servidor. Si ya esta funcionando, no necesitas iniciar otro. Si el puerto esta ocupado por otra aplicacion, utiliza otro puerto, por ejemplo `npm run start -- --port 4201`.

Para comprobar compilacion:

```powershell
npm run build
```

Si no ves tu cambio, revisa primero que archivo usa la ruta, las media queries y los estilos calculados. No borres todo localStorage para "limpiar cache": este proyecto aun conserva alli datos de negocio.

## 10. Cambios que necesitan mas cuidado

No toques por un ajuste visual: autenticacion, permisos, servicios de datos, stock, caja, reservas, comisiones, migraciones o credenciales.
No cambies rutas para hacer que un CSS se aplique. No edites `dist`, `node_modules` ni `target`: son dependencias o resultados de compilacion.

Esta guia describe archivos verificados en la fecha indicada, no garantiza que todos los flujos funcionen. Si se reorganizan componentes, actualiza este mapa y verifica sus enlaces.
