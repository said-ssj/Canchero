BEGIN;
CREATE TABLE public.perfil_jugador (
    id_usuario uuid PRIMARY KEY REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    direccion varchar(180),
    foto text CHECK (char_length(foto) <= 150000)
);
ALTER TABLE public.perfil_jugador ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.perfil_jugador FROM PUBLIC, anon, authenticated;
COMMIT;
