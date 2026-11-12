# Primer acceso y selector de emojis

## Registro y primer acceso

Los registros por correo y Google pasan por `/perfil` para completar la cuenta.
Nombres, apellidos y un identificador público único de 3 a 30 caracteres son
obligatorios. Foto, celular y ubicación son opcionales. La dirección puede
guardarse sin seleccionar departamento, provincia o distrito.

El identificador admite letras minúsculas, números, puntos, guiones y guiones
bajos; la interfaz muestra el prefijo `@`. El servidor normaliza y valida su
unicidad. Después de elegirlo, se conserva la regla existente de tres meses
entre cambios. No se genera un identificador de muestra.

La API guarda el identificador y los datos personales en una transacción: si
el identificador está ocupado no guarda el resto a medias. El estado completo
se calcula en el servidor; no se acepta como prueba el booleano del navegador.
Las cuentas existentes con datos incompletos también reciben el formulario.
Los retornos de pago, lectura de pases y recuperación de acceso quedan fuera
de esta redirección para permitir terminar esos flujos.

Se reutilizan `perfil_jugador`, `perfil_comunidad`, el índice único y el control
de cambios existentes. Esta entrega no requiere una migración nueva ni cambia
roles o permisos de negocio.

## Emojis

Chat y publicaciones usan el mismo componente `app-emoji-button`, con
`emoji-picker-element` y el conjunto CLDR en español de
`emoji-picker-element-data`, fijados en package-lock.json.

El selector permite buscar, navegar por categorías y elegir tonos de piel.
Inserta en la posición del cursor o reemplaza la selección; respeta el límite
del campo sin cortar emojis compuestos. Los permisos para enviar mensajes y
publicar siguen aplicándose al botón.

Antes de iniciar, compilar o probar, `scripts/prepare-emojis.mjs` copia el JSON
y su licencia desde la dependencia a `public/assets/emojis/`. Esa carpeta es
generada y está ignorada en Git. El despliegue sirve estos datos desde el mismo
origen; ya no se descarga una lista desde emojiapi.dev. Se guardan caracteres
Unicode en los campos de texto existentes, sin tablas nuevas.

## Comprobación

- Pruebas de PostgreSQL: datos obligatorios, identificador duplicado, rollback,
  conservación del identificador y plazo entre cambios.
- Pruebas Angular: formulario para ambos accesos, redirecciones sin bucles,
  campos opcionales y conservación del contenido ante error.
- Pruebas de inserción: posición del cursor, reemplazo y secuencias Unicode.
- Compilar con `npm run build --workspace=apps/web` y comprobar que el resultado
  contiene `assets/emojis/data.json` y `assets/emojis/LICENSE`.

La integración está en los archivos locales; requiere publicar frontend y API
para estar disponible en Vercel y Render. No se verificó visualmente en navegador
durante esta entrega.
