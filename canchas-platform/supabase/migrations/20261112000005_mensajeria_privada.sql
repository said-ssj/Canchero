BEGIN;
CREATE TABLE public.chat_conversacion (
    id_conversacion uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_a uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    usuario_b uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    creada_en timestamptz NOT NULL DEFAULT now(),
    actualizada_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chat_pareja_ordenada CHECK(usuario_a < usuario_b),
    CONSTRAINT chat_pareja_unica UNIQUE(usuario_a, usuario_b)
);
CREATE TABLE public.chat_miembro (
    id_conversacion uuid NOT NULL REFERENCES public.chat_conversacion(id_conversacion) ON DELETE RESTRICT,
    id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    ultimo_leido bigint NOT NULL DEFAULT 0 CHECK(ultimo_leido >= 0),
    PRIMARY KEY(id_conversacion, id_usuario)
);
CREATE INDEX chat_miembro_usuario_idx ON public.chat_miembro(id_usuario, id_conversacion);
CREATE TABLE public.chat_mensaje (
    id_mensaje bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_conversacion uuid NOT NULL,
    id_autor uuid NOT NULL,
    id_solicitud uuid NOT NULL,
    contenido text NOT NULL CHECK(char_length(btrim(contenido)) BETWEEN 1 AND 4000),
    creado_en timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(id_conversacion,id_autor) REFERENCES public.chat_miembro(id_conversacion,id_usuario),
    UNIQUE(id_autor,id_solicitud)
);
CREATE INDEX chat_mensaje_historial_idx ON public.chat_mensaje(id_conversacion,id_mensaje DESC);
CREATE INDEX chat_mensaje_autor_fecha_idx ON public.chat_mensaje(id_autor,creado_en DESC);
CREATE TABLE public.chat_bloqueo (
    id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    id_bloqueado uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
    creado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(id_usuario,id_bloqueado),
    CHECK(id_usuario <> id_bloqueado)
);
CREATE INDEX chat_bloqueo_inverso_idx ON public.chat_bloqueo(id_bloqueado,id_usuario);
CREATE TABLE public.chat_reporte (
    id_reporte uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_conversacion uuid NOT NULL REFERENCES public.chat_conversacion(id_conversacion),
    id_autor uuid NOT NULL REFERENCES public.usuario(id_usuario),
    motivo text NOT NULL CHECK(char_length(btrim(motivo)) BETWEEN 5 AND 1000),
    creado_en timestamptz NOT NULL DEFAULT now(),
    estado text NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','revisado'))
);
CREATE INDEX chat_reporte_pendiente_idx ON public.chat_reporte(creado_en) WHERE estado='pendiente';
CREATE INDEX chat_reporte_autor_fecha_idx ON public.chat_reporte(id_autor,creado_en DESC);

ALTER TABLE public.chat_conversacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_miembro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_bloqueo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reporte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_conversacion,public.chat_miembro,public.chat_mensaje,public.chat_bloqueo,public.chat_reporte FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.chat_mensaje_id_mensaje_seq FROM PUBLIC,anon,authenticated;

-- Solo invalidaciones de la bandeja propia. Ningún texto viaja en Broadcast.
-- La API vuelve a comprobar identidad, membresía y bloqueo al leer o escribir.
CREATE POLICY canchero_chat_notificaciones_propias ON realtime.messages
    FOR SELECT TO authenticated
    USING (extension='broadcast' AND topic=(select realtime.topic()) AND (select realtime.topic())='chat-user:'||(select auth.uid())::text
           AND (select auth.jwt()->>'canchero_user_id')=(select auth.uid())::text);

CREATE FUNCTION public.chat_notificar_mensaje() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE member_id uuid;
BEGIN
    UPDATE public.chat_conversacion SET actualizada_en=NEW.creado_en WHERE id_conversacion=NEW.id_conversacion;
    FOR member_id IN SELECT id_usuario FROM public.chat_miembro WHERE id_conversacion=NEW.id_conversacion LOOP
        PERFORM realtime.send(jsonb_build_object('conversationId',NEW.id_conversacion::text),
                              'changed','chat-user:'||member_id::text,true);
    END LOOP;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_notificar_mensaje() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER chat_mensaje_notificacion AFTER INSERT ON public.chat_mensaje
    FOR EACH ROW EXECUTE FUNCTION public.chat_notificar_mensaje();
COMMENT ON TABLE public.chat_mensaje IS 'Mensajes privados servidos por API. Control de participantes; esta versión no implementa E2EE.';
COMMIT;
