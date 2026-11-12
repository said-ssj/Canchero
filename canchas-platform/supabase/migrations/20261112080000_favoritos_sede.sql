-- Preferencias de cuenta gestionadas exclusivamente por la API Spring.
BEGIN;
CREATE TABLE public.favorito_sede (
    id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    id_sede integer NOT NULL REFERENCES public.sede(id_sede) ON DELETE CASCADE,
    fecha_creacion timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id_usuario, id_sede)
);
CREATE INDEX favorito_sede_sede_idx ON public.favorito_sede(id_sede);
ALTER TABLE public.favorito_sede ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.favorito_sede FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.favorito_sede IS
    'Sedes favoritas por cuenta. La API deriva el autor de la sesión; sin acceso directo del navegador.';
COMMIT;
