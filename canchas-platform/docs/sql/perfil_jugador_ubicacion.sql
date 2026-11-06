BEGIN;
ALTER TABLE public.perfil_jugador
    ADD COLUMN IF NOT EXISTS id_distrito integer REFERENCES public.distrito(id_distrito) ON DELETE SET NULL;
COMMIT;
