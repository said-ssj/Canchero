# Perfiles personales, sedes y comunidad

## Identidad y rutas

- /perfil es la cuenta autenticada y muestra su perfil de comunidad; Editar perfil conserva el formulario privado existente.
- /perfiles/:id es el perfil público de la persona, sea jugador o dueño.
- /sedes/:id conserva el detalle de UNA sede para consultar su disponibilidad y reservar; enlaza al perfil del dueño real.
- Un dueño conserva nombre completo, foto y biografía propios. Sus sedes no sustituyen su identidad.
- El avatar se lee exclusivamente de perfil_jugador.foto del usuario vinculado. Si falta o falla se muestran sus iniciales. Las fotos de sedes/canchas nunca se usan como avatar personal.
- La portada personal es independiente. Sin portada subida se utiliza un fondo decorativo; no se toma una foto del negocio.

## Dueños con una o varias sedes

El perfil público obtiene las sedes con sede.id_dueno = usuario.id_usuario y estado A. No utiliza el alcance global de administración ni borradores locales. Así un administrador no aparece como dueño de todos los complejos que puede gestionar.

Las pestañas reúnen Publicaciones, Sedes, Canchas, Servicios, Galería, Reseñas, Ubicaciones e Información. Cada cancha, foto de complejo, reseña y ubicación conserva el vínculo con su sede. Los horarios y la reserva siguen siendo específicos de cada sede/cancha.

La calificación general es AVG de todas las reseñas reales activas de esas sedes, con COUNT total. No es un promedio de los promedios por sede. Excluye reseñas sintéticas y muestra las 20 opiniones más recientes con el nombre de su sede. No inventa puntuaciones cuando no hay reseñas.

## Publicaciones y seguimiento

Jugador y dueño usan el mismo componente y servicio para publicar texto y hasta cuatro fotografías. La persona autenticada es siempre la autora; no se acepta un autor enviado por el navegador. Feed de diez publicaciones por página, ordenadas por fecha e identificador; eliminación lógica únicamente por el autor y con confirmación en UI.

Seguir/dejar de seguir requiere sesión, impide autoseguimiento y utiliza una clave única por pareja para evitar duplicados. Los contadores proceden de PostgreSQL.

Presentación y portada permite guardar biografía, portada personal y un WhatsApp público opcional con código de país. El teléfono privado NO se copia automáticamente. La API pública tampoco expone correo, dirección personal, contraseña, reservas, caja, ventas ni ingresos.

## Persistencia y coste

La migración aditiva docs/sql/perfiles_comunidad.sql crea perfil_comunidad, publicacion_perfil y seguimiento_perfil. Se aplicó a Supabase sin crear usuarios, publicaciones o seguimientos de muestra. RLS activado y permisos revocados a PUBLIC/anon/authenticated; las escrituras pasan por la API autenticada.

Fotos: el navegador acepta JPG/PNG/WebP de hasta 5 MB, reduce el lado mayor a 1000 px y convierte a JPEG sin conservar metadatos EXIF. La API valida formato/dimensiones, hasta cuatro imágenes de 150000 caracteres por publicación; se guardan como datos JPEG en JSONB dentro de la BD existente. La portada usa texto JPEG acotado. No se contrató almacenamiento ni un proveedor adicional. A mayor escala se puede migrar el contenido multimedia a un bucket; no es necesario contratarlo para esta entrega universitaria.

Las fotos y el contacto de cada sede siguen usando los registros existentes del complejo. No se modificó la estructura de reservas, reseñas, pagos ni inventario.

## Verificación

Pruebas PostgreSQL temporal: dueño con varias sedes y alcance estricto incluso si es administrador; foto personal distinta de portada de sede; exclusión de correo/teléfono/dirección privados; promedio ponderado por reseña real; publicación de JPEG por jugador/dueño; bloqueo de eliminación ajena; seguimiento idempotente y presentación propia.

Pruebas HTTP: lectura pública de publicaciones, autenticación obligatoria en escrituras/relaciones y autor tomado de la sesión aunque el cuerpo intente enviar otro.

Pruebas web: identidad/foto del dueño, varias sedes, resumen de reseñas y conservación de texto/fotos cuando falla publicar. Revisión visual local en escritorio/móvil, galería de sede separada del avatar y ausencia de publicaciones/reseñas reales como estado vacío. No se publicaron mensajes de prueba en la BD compartida. Cambios locales, sin commit/push/despliegue automático.