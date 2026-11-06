-- Propuesta para revisar y probar en PostgreSQL antes de aplicar en Supabase.
-- El índice rechazará correos duplicados que solo difieran en mayúsculas.
BEGIN;

CREATE UNIQUE INDEX usuario_correo_google_normalizado_idx ON public.usuario (lower(correo));

CREATE TABLE public.usuario_auth_google (
    id_auth uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    id_usuario uuid NOT NULL UNIQUE REFERENCES public.usuario(id_usuario) ON DELETE CASCADE
);
ALTER TABLE public.usuario_auth_google ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usuario_auth_google FROM PUBLIC, anon, authenticated;

COMMIT;
