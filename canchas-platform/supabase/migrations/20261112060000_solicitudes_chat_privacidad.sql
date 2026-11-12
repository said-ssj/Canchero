BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.chat_conversacion
 ADD COLUMN iniciador uuid REFERENCES public.usuario(id_usuario),
 ADD COLUMN aceptada_en timestamptz,
 ADD CONSTRAINT chat_iniciador_participante CHECK(iniciador IS NULL OR iniciador IN(usuario_a,usuario_b));
-- Conserva las conversaciones ya utilizadas; las nuevas requieren una solicitud aceptada.
UPDATE public.chat_conversacion c SET aceptada_en=now()
 WHERE EXISTS(SELECT 1 FROM public.chat_mensaje m WHERE m.id_conversacion=c.id_conversacion);
ALTER TABLE public.chat_reporte
 ADD COLUMN id_reportado uuid REFERENCES public.usuario(id_usuario),
 ADD COLUMN categoria varchar(30),
 ADD COLUMN calificado boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT chat_reporte_categoria CHECK(categoria IS NULL OR categoria IN('acoso','spam','estafa','odio','violencia','sexual','suplantacion','otros')),
 ADD CONSTRAINT chat_reporte_distinto CHECK(id_reportado IS NULL OR id_reportado<>id_autor);
CREATE UNIQUE INDEX chat_reporte_persona_pendiente_unique ON public.chat_reporte(id_autor,id_reportado)
 WHERE estado='pendiente' AND id_reportado IS NOT NULL;
CREATE INDEX chat_reporte_destino_fecha_idx ON public.chat_reporte(id_reportado,creado_en DESC) WHERE estado='pendiente';
CREATE TABLE public.chat_revision (
 id_usuario uuid PRIMARY KEY REFERENCES public.usuario(id_usuario),
 estado varchar(20) NOT NULL DEFAULT 'pendiente' CHECK(estado IN('pendiente','revisado')),
 reportes integer NOT NULL CHECK(reportes>=0),
 calificados integer NOT NULL CHECK(calificados>=0),
 suspendida_hasta timestamptz,
 creada_en timestamptz NOT NULL DEFAULT now(),
 actualizada_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chat_revision_decision (
 id_decision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario),
 id_revisor uuid NOT NULL REFERENCES public.usuario(id_usuario),
 decision varchar(20) NOT NULL CHECK(decision IN('descartar','mantener')),
 motivo varchar(1000) NOT NULL CHECK(char_length(btrim(motivo)) BETWEEN 10 AND 1000),
 creada_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_revision_decision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_revision,public.chat_revision_decision FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.chat_revision_decision_id_decision_seq FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.chat_revision IS 'Revision humana de reportes distintos. Restriccion temporal solo de mensajes y publicaciones; no modifica reservas ni rol.';
COMMIT;
