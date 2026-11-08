-- Estructura aditiva para perfiles personales con varias sedes, publicaciones y seguimiento.
-- No crea usuarios, publicaciones, seguidores ni datos de muestra.
BEGIN;
CREATE TABLE IF NOT EXISTS public.perfil_comunidad (
  id_usuario uuid PRIMARY KEY REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
  biografia varchar(500) NOT NULL DEFAULT '',
  whatsapp_publico varchar(20) NOT NULL DEFAULT '',
  portada text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perfil_portada_limite CHECK (portada IS NULL OR char_length(portada) <= 180000)
);
CREATE TABLE IF NOT EXISTS public.publicacion_perfil (
  id_publicacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
  texto varchar(2000) NOT NULL DEFAULT '',
  fotos jsonb NOT NULL DEFAULT '[]',
  estado char(1) NOT NULL DEFAULT 'A' CHECK (estado IN ('A','I')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publicacion_fotos_lista CHECK (jsonb_typeof(fotos) = 'array' AND jsonb_array_length(fotos) <= 4),
  CONSTRAINT publicacion_fotos_limite CHECK (octet_length(fotos::text) <= 650000),
  CONSTRAINT publicacion_contenido CHECK (char_length(btrim(texto)) > 0 OR jsonb_array_length(fotos) > 0)
);
CREATE INDEX IF NOT EXISTS publicacion_perfil_autor_fecha_idx ON public.publicacion_perfil(id_usuario,creado_en DESC,id_publicacion DESC) WHERE estado='A';
CREATE TABLE IF NOT EXISTS public.seguimiento_perfil (
  id_seguidor uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
  id_seguido uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_seguidor,id_seguido),
  CONSTRAINT seguimiento_sin_autoseguir CHECK (id_seguidor <> id_seguido)
);
CREATE INDEX IF NOT EXISTS seguimiento_perfil_seguido_idx ON public.seguimiento_perfil(id_seguido);
ALTER TABLE public.perfil_comunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguimiento_perfil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.perfil_comunidad, public.publicacion_perfil, public.seguimiento_perfil FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON public.perfil_comunidad, public.publicacion_perfil, public.seguimiento_perfil FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMENT ON TABLE public.perfil_comunidad IS 'Presentacion publica voluntaria. Foto del usuario procede de perfil_jugador; sin telefono/direccion privados.';
COMMENT ON TABLE public.publicacion_perfil IS 'Publicaciones personales de jugador o dueño, con imagenes JPEG acotadas; escrituras solo por API autenticada.';
COMMIT;
