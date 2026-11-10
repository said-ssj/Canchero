-- Estructura de autorizacion por negocio y sede. Ejecutar completa UNA vez.
-- No contiene cuentas, claves, hashes ni asignaciones de propietarios.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(20261107, 701);

INSERT INTO public.rol (nombre, descripcion, usucre)
SELECT v.nombre, v.descripcion, 'MIGRACION_ROLES_SEDE'
FROM (VALUES
 ('superadmin', 'Administracion de plataforma y usuarios'),
 ('dueno', 'Propietario de uno o varios recintos de su negocio'),
 ('admin', 'Administrador contratado; requiere asignacion a cada sede'),
 ('cajero', 'Caja, cobros y ventas de las sedes asignadas'),
 ('ayudante', 'Agenda, pases y asistencia de las sedes asignadas'),
 ('almacen', 'Productos e inventario de las sedes asignadas')
) v(nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.rol r WHERE lower(r.nombre) = v.nombre);
UPDATE public.rol SET descripcion='Administrador contratado del negocio: solo sedes con asignacion activa; sin acceso global',
 usmod='MIGRACION_ROLES_SEDE',pcmod='JDBC',fecmod=now() WHERE nombre='admin';

CREATE TABLE public.negocio (
 id_negocio bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_dueno uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
 nombre varchar(160) NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 160),
 estado char(1) NOT NULL DEFAULT 'A' CHECK (estado IN ('A','I')),
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT negocio_dueno_unico UNIQUE (id_dueno),
 CONSTRAINT negocio_identidad_dueno UNIQUE (id_negocio,id_dueno)
);

ALTER TABLE public.sede ADD COLUMN id_negocio bigint;
ALTER TABLE public.sede ADD CONSTRAINT sede_negocio_dueno_fk
 FOREIGN KEY (id_negocio,id_dueno) REFERENCES public.negocio(id_negocio,id_dueno) ON DELETE RESTRICT;
ALTER TABLE public.sede ADD CONSTRAINT sede_negocio_propiedad_check
 CHECK ((id_negocio IS NULL) = (id_dueno IS NULL)) NOT VALID;
ALTER TABLE public.sede ADD CONSTRAINT sede_identidad_negocio UNIQUE (id_sede,id_negocio);
CREATE INDEX sede_negocio_idx ON public.sede(id_negocio);

CREATE TABLE public.miembro_negocio (
 id_miembro bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_negocio bigint NOT NULL REFERENCES public.negocio(id_negocio) ON DELETE RESTRICT,
 id_usuario uuid NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE RESTRICT,
 estado char(1) NOT NULL DEFAULT 'A' CHECK (estado IN ('A','I')),
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT miembro_usuario_negocio UNIQUE (id_negocio,id_usuario),
 CONSTRAINT miembro_identidad_negocio UNIQUE (id_miembro,id_negocio)
);
CREATE INDEX miembro_usuario_idx ON public.miembro_negocio(id_usuario);

CREATE TABLE public.rol_sede (
 codigo varchar(20) PRIMARY KEY CHECK (codigo IN ('admin','cajero','ayudante','almacen')),
 id_rol integer NOT NULL UNIQUE REFERENCES public.rol(id_rol) ON DELETE RESTRICT,
 descripcion text NOT NULL
);
INSERT INTO public.rol_sede(codigo,id_rol,descripcion)
SELECT r.nombre,r.id_rol,v.descripcion FROM public.rol r
JOIN (VALUES
 ('admin','Coordinacion operativa; sin transferir propiedad ni administrar usuarios globales'),
 ('cajero','Turno propio, cobros y ventas; sin ajustes de inventario'),
 ('ayudante','Agenda y verificacion de pases; sin informacion financiera'),
 ('almacen','Catalogo e inventario; sin cobros ni caja')
) v(codigo,descripcion) ON v.codigo=r.nombre;

CREATE TABLE public.permiso_sede (
 codigo varchar(60) PRIMARY KEY,
 descripcion text NOT NULL
);
INSERT INTO public.permiso_sede VALUES
 ('sede.ver','Consultar contexto de la sede'),
 ('sede.editar','Editar datos del recinto'),
 ('sede.eliminar','Desactivar una sede: reservado al propietario'),
 ('cancha.gestionar','Crear y editar canchas, horarios, cierres y mantenimiento'),
 ('reserva.ver','Consultar reservas de la sede'),
 ('reserva.agenda','Consultar agenda sin importes ni datos de pago'),
 ('reserva.gestionar','Confirmar, completar o reprogramar reservas'),
 ('reserva.cancelar','Cancelar reservas con confirmacion'),
 ('pase.verificar','Consultar y verificar pases de acceso'),
 ('caja.operar','Operar el turno propio y cobrar reservas'),
 ('caja.supervisar','Supervisar turnos ajenos de la sede'),
 ('venta.ver','Consultar ventas e historial de la sede'),
 ('venta.crear','Realizar una venta POS'),
 ('producto.ver','Consultar catalogo y existencias'),
 ('producto.gestionar','Gestionar productos, categorias y precios'),
 ('inventario.ver','Consultar kardex'),
 ('inventario.ingresar','Registrar ingresos de mercaderia'),
 ('finanzas.ver','Consultar finanzas del negocio'),
 ('personal.gestionar','Administrar asignaciones operativas de la sede'),
 ('reporte.ver','Consultar incidencias de canchas'),
 ('reporte.gestionar','Resolver incidencias de canchas');

CREATE TABLE public.rol_sede_permiso (
 rol_codigo varchar(20) NOT NULL REFERENCES public.rol_sede(codigo) ON DELETE RESTRICT,
 permiso_codigo varchar(60) NOT NULL REFERENCES public.permiso_sede(codigo) ON DELETE RESTRICT,
 PRIMARY KEY (rol_codigo,permiso_codigo)
);
INSERT INTO public.rol_sede_permiso
SELECT 'admin',codigo FROM public.permiso_sede WHERE codigo <> 'sede.eliminar';
INSERT INTO public.rol_sede_permiso VALUES
 ('cajero','sede.ver'),('cajero','reserva.ver'),('cajero','reserva.agenda'),('cajero','reserva.gestionar'),
 ('cajero','pase.verificar'),('cajero','caja.operar'),('cajero','venta.ver'),
 ('cajero','venta.crear'),('cajero','producto.ver'),
 ('ayudante','sede.ver'),('ayudante','reserva.agenda'),('ayudante','pase.verificar'),
 ('ayudante','reporte.ver'),
 ('almacen','sede.ver'),('almacen','producto.ver'),('almacen','producto.gestionar'),
 ('almacen','inventario.ver'),('almacen','inventario.ingresar');

CREATE TABLE public.asignacion_sede (
 id_asignacion bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_negocio bigint NOT NULL REFERENCES public.negocio(id_negocio) ON DELETE RESTRICT,
 id_miembro bigint NOT NULL,
 id_sede integer NOT NULL,
 rol_codigo varchar(20) NOT NULL REFERENCES public.rol_sede(codigo) ON DELETE RESTRICT,
 estado char(1) NOT NULL DEFAULT 'A' CHECK (estado IN ('A','I')),
 fecha_creacion timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT asignacion_miembro_negocio_fk FOREIGN KEY(id_miembro,id_negocio)
  REFERENCES public.miembro_negocio(id_miembro,id_negocio) ON DELETE RESTRICT,
 CONSTRAINT asignacion_sede_negocio_fk FOREIGN KEY(id_sede,id_negocio)
  REFERENCES public.sede(id_sede,id_negocio) ON DELETE RESTRICT,
 CONSTRAINT asignacion_rol_unico UNIQUE(id_miembro,id_sede,rol_codigo)
);
CREATE INDEX asignacion_sede_idx ON public.asignacion_sede(id_sede,id_negocio);

-- Compatibilidad con la API: id_dueno sigue siendo la propiedad canonica.
-- Una transferencia a otro negocio se rechaza si conserva empleados asignados.
CREATE FUNCTION public.sincronizar_negocio_sede() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
BEGIN
 IF NEW.id_dueno IS NULL THEN
  NEW.id_negocio := NULL;
 ELSE
  INSERT INTO public.negocio(id_dueno,nombre)
  SELECT u.id_usuario,'Negocio de ' || left(btrim(u.nombre || ' ' || u.apellido),140)
  FROM public.usuario u WHERE u.id_usuario=NEW.id_dueno
  ON CONFLICT(id_dueno) DO NOTHING;
  SELECT n.id_negocio INTO STRICT NEW.id_negocio FROM public.negocio n WHERE n.id_dueno=NEW.id_dueno;
  INSERT INTO public.miembro_negocio(id_negocio,id_usuario)
  VALUES(NEW.id_negocio,NEW.id_dueno) ON CONFLICT(id_negocio,id_usuario) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sede_sincronizar_negocio BEFORE INSERT OR UPDATE OF id_dueno,id_negocio
 ON public.sede FOR EACH ROW EXECUTE FUNCTION public.sincronizar_negocio_sede();
UPDATE public.sede SET id_dueno=id_dueno WHERE id_dueno IS NOT NULL;
ALTER TABLE public.sede VALIDATE CONSTRAINT sede_negocio_propiedad_check;

-- Solo la API confiable puede invocarla: p_usuario viene de la sesion validada.
CREATE FUNCTION public.tiene_permiso_sede(p_usuario uuid,p_sede integer,p_permiso text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog,public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.usuario u JOIN public.rol r ON r.id_rol=u.id_rol
  JOIN public.sede s ON s.id_sede=p_sede AND s.estado='A'
  JOIN public.negocio n ON n.id_negocio=s.id_negocio AND n.id_dueno=s.id_dueno AND n.estado='A'
  JOIN public.usuario d ON d.id_usuario=n.id_dueno AND d.estado='A'
  JOIN public.permiso_sede p ON p.codigo=p_permiso
  WHERE u.id_usuario=p_usuario AND u.estado='A' AND r.estado='A'
   AND (r.nombre='superadmin' OR (n.id_dueno=u.id_usuario AND r.nombre IN ('dueno','dueño','owner','propietario')) OR EXISTS (
    SELECT 1 FROM public.miembro_negocio m JOIN public.asignacion_sede a
     ON a.id_miembro=m.id_miembro AND a.id_negocio=m.id_negocio
    JOIN public.rol_sede rs ON rs.codigo=a.rol_codigo
    JOIN public.rol rr ON rr.id_rol=rs.id_rol AND rr.estado='A'
    JOIN public.rol_sede_permiso rp ON rp.rol_codigo=rs.codigo AND rp.permiso_codigo=p_permiso
    WHERE m.id_usuario=u.id_usuario AND m.id_negocio=n.id_negocio AND m.estado='A'
     AND a.id_sede=s.id_sede AND a.estado='A'
   ))
 );
$$;

DO $$
DECLARE t text; seq_name text;
BEGIN
 FOREACH t IN ARRAY ARRAY['negocio','miembro_negocio','rol_sede','permiso_sede','rol_sede_permiso','asignacion_sede'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
  seq_name:=NULL;
  IF t IN ('negocio','miembro_negocio','asignacion_sede') THEN
   seq_name:=pg_get_serial_sequence('public.'||t,CASE t WHEN 'negocio' THEN 'id_negocio' WHEN 'miembro_negocio' THEN 'id_miembro' ELSE 'id_asignacion' END);
  END IF;
  IF seq_name IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated',seq_name); END IF;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.sincronizar_negocio_sede() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tiene_permiso_sede(uuid,integer,text) FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.asignacion_sede IS 'Roles operativos por sede: ambas FK compuestas deben pertenecer al mismo negocio. No otorga privilegios globales.';
COMMENT ON TABLE public.negocio IS 'Un negocio por propietario inicialmente, con una o varias sedes. La propiedad no depende de usucre.';
COMMIT;
