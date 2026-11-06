# Activar Google en Canchero

Google comprueba la identidad mediante Supabase Auth. Spring valida el token con
el proyecto Supabase y emite la sesión de Canchero. El inicio por contraseña
continúa usando Spring. Cada cuenta existente confirma su contraseña de Canchero
una vez para asociar Google a su mismo perfil.

## Prueba y activación

1. Revisar en un entorno de prueba el SQL [propuesta_google_auth.sql](sql/propuesta_google_auth.sql).
   Antes de aplicarlo, contar los grupos de correos duplicados con la consulta
   de abajo. Resolver cualquier duplicado antes de crear el índice.
2. En Supabase, abrir **Authentication → Sign In / Providers → Google** y copiar
   la URL de callback que muestra el proveedor. En Google Cloud, crear un cliente
   OAuth web, configurar la audiencia de prueba y registrar ese callback en
   **Authorized redirect URIs**. Configurar el ID y el secreto en Supabase.
3. En **Authentication → URL Configuration**, añadir las URLs de regreso a Canchero:
   - Desarrollo: `http://localhost:4200/auth/google/callback`.
   - Producción: `https://canchero-iota.vercel.app/auth/google/callback`.
   Para un entorno de prueba distinto, registrar su origen exacto y el mismo path.
4. Después de verificar el SQL y el proveedor, configurar `GOOGLE_AUTH_ENABLED=true`
   en la API y en el build de Angular. La API también necesita `SUPABASE_URL` y
   `SUPABASE_ANON_KEY` públicas del mismo proyecto. En local, esas variables se
   pueden colocar en `.env.local`. En Vercel se requiere un nuevo build.
5. Probar alta de jugador, vinculación con contraseña, cuenta inactiva,
   cancelación de Google, cierre de sesión y recarga. Verificar que el dueño
   conserva el mismo perfil y el alcance sobre sus sedes.

```sql
SELECT count(*) AS grupos_con_correo_duplicado
FROM (
    SELECT lower(correo)
    FROM public.usuario
    WHERE correo IS NOT NULL
    GROUP BY lower(correo)
    HAVING count(*) > 1
) duplicados;
```

La tabla de vinculación queda cerrada para los roles del navegador. Si Spring
usa un rol JDBC dedicado, conceder únicamente los permisos de lectura e
inserción necesarios sobre esa tabla. Mantener el secreto de Google en Supabase.

Para desactivar Google, configurar `GOOGLE_AUTH_ENABLED=false` en la API y
recompilar Angular con el mismo valor. Las vinculaciones se conservan para un
reintento posterior. Antes de desactivar un entorno con jugadores registrados
solo con Google, definir cómo recuperarán su acceso.

- [Configurar Google en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Intercambio de código PKCE](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession)
- [Verificar un usuario en Supabase](https://supabase.com/docs/reference/javascript/auth-getuser)
