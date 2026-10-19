-- =============================================================================
-- Migración SQL Versionada — Fase 4: Persistencia Segura, Concurrencia e Idempotencia
-- Fecha: 2026-10-16
-- Archivo: canchas-platform/docs/sql/2026-10-16_fase4_reserva_concurrencia_idempotencia.sql
-- Estado: PREPARADA Y VALIDADA EN ENTORNO AISLADO (PENDIENTE DE AUTORIZACIÓN PARA REMOTO)
-- =============================================================================
-- Propósito:
-- 1. Prevenir doble reserva simultánea (TOCTOU) a nivel físico de motor PostgreSQL
--    mediante una restricción de exclusión GiST (EXCLUDE USING gist) sobre
--    (id_cancha, intervalo temporal de la reserva) para reservas activas
--    (estado = 'A' y estado de reserva pendiente/confirmada/aprobada).
-- 2. Soportar intervalos que cruzan a la medianoche (ej. 22:00 - 00:00 -> día + 1 00:00).
-- 3. Garantizar idempotencia por operación mediante índice único parcial sobre
--    (id_usuario, idempotency_key) y columnas aditivas opcionales (sin destruir datos).
-- =============================================================================

-- =============================================================================
-- PASO 1: PRE-CHEQUEO NO DESTRUCTIVO (Ejecutar antes de aplicar el bloque DDL)
-- =============================================================================
-- 1.1 Verificar si existen reservas activas con solapamiento horario en la misma cancha:
SELECT
    r1.id_reserva AS reserva_a,
    r2.id_reserva AS reserva_b,
    r1.id_cancha,
    r1.fecha_reserva,
    r1.hora_inicio AS inicio_a,
    r1.hora_fin AS fin_a,
    r2.hora_inicio AS inicio_b,
    r2.hora_fin AS fin_b
FROM public.reserva r1
JOIN public.reserva r2
  ON r1.id_cancha = r2.id_cancha
 AND r1.fecha_reserva = r2.fecha_reserva
 AND r1.id_reserva < r2.id_reserva
WHERE r1.estado = 'A'
  AND r2.estado = 'A'
  AND r1.id_estado_reserva IN (1, 2)
  AND r2.id_estado_reserva IN (1, 2)
  AND (r1.fecha_reserva + r1.hora_inicio) < (
      CASE WHEN r2.hora_fin = TIME '00:00:00' AND r2.hora_inicio > TIME '00:00:00'
           THEN (r2.fecha_reserva + INTERVAL '1 day')
           ELSE (r2.fecha_reserva + r2.hora_fin)
      END
  )
  AND (
      CASE WHEN r1.hora_fin = TIME '00:00:00' AND r1.hora_inicio > TIME '00:00:00'
           THEN (r1.fecha_reserva + INTERVAL '1 day')
           ELSE (r1.fecha_reserva + r1.hora_fin)
      END
  ) > (r2.fecha_reserva + r2.hora_inicio);

-- 1.2 Verificar si existen reservas activas con rango inválido (hora_fin <= hora_inicio salvo medianoche 00:00:00):
SELECT id_reserva, id_cancha, fecha_reserva, hora_inicio, hora_fin, id_estado_reserva
FROM public.reserva
WHERE estado = 'A'
  AND hora_fin <= hora_inicio
  AND NOT (hora_fin = TIME '00:00:00' AND hora_inicio > TIME '00:00:00');

-- NOTA: Si las consultas 1.1 o 1.2 devuelven filas, NO eliminar ni reasignar filas
-- automáticamente. Revisar con el responsable antes de aplicar la restricción EXCLUDE.

-- =============================================================================
-- PASO 2: MIGRACIÓN ADITIVA Y TRANSACCIONAL
-- =============================================================================
BEGIN;

-- 2.1 Extensión necesaria para combinar igualdad escalar (id_cancha) con rango tsrange en GiST
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2.2 Columnas aditivas opcionales en public.reserva para trazabilidad de idempotencia y tramos
ALTER TABLE public.reserva
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120),
    ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS desglose_tarifas JSONB;

-- 2.3 Función inmutable que proyecta (fecha_reserva, hora_inicio, hora_fin) a tsrange '[inicio, fin)'
--     tratando hora_fin = 00:00:00 (cuando hora_inicio > 00:00:00) como medianoche del día siguiente.
CREATE OR REPLACE FUNCTION public.reserva_intervalo_ts(
    p_fecha DATE,
    p_hora_inicio TIME,
    p_hora_fin TIME
) RETURNS tsrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT tsrange(
        p_fecha + p_hora_inicio,
        CASE
            WHEN p_hora_fin = TIME '00:00:00' AND p_hora_inicio > TIME '00:00:00'
                THEN (p_fecha + INTERVAL '1 day')
            ELSE (p_fecha + p_hora_fin)
        END,
        '[)'
    );
$$;

-- 2.4 Validación de rango horario coherente (NOT VALID para no bloquear datos históricos;
--     se valida sobre toda fila nueva o actualizada)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reserva_rango_horario_chk'
    ) THEN
        ALTER TABLE public.reserva
            ADD CONSTRAINT reserva_rango_horario_chk
            CHECK (
                hora_fin > hora_inicio
                OR (hora_fin = TIME '00:00:00' AND hora_inicio > TIME '00:00:00')
            ) NOT VALID;
    END IF;
END $$;

-- 2.5 Índice único parcial de idempotencia por usuario autenticado y operación
CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_usuario_idempotency_key
    ON public.reserva (id_usuario, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND estado = 'A';

-- 2.6 Índice único parcial sobre pago_reserva.numero_operacion para claves IDEMP:*
CREATE UNIQUE INDEX IF NOT EXISTS idx_pago_reserva_idemp_op
    ON public.pago_reserva (numero_operacion)
    WHERE numero_operacion LIKE 'IDEMP:%' AND estado = 'A';

-- 2.7 Restricción de exclusión GiST contra doble reserva simultánea en la misma cancha
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reserva_no_solapamiento_excl'
    ) THEN
        ALTER TABLE public.reserva
            ADD CONSTRAINT reserva_no_solapamiento_excl
            EXCLUDE USING gist (
                id_cancha WITH =,
                public.reserva_intervalo_ts(fecha_reserva, hora_inicio, hora_fin) WITH &&
            )
            WHERE (estado = 'A' AND id_estado_reserva IN (1, 2));
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- PASO 3: VERIFICACIÓN POST-MIGRACIÓN
-- =============================================================================
-- Verificar existencia de la restricción e índices creados:
SELECT conname, contype, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.reserva'::regclass
  AND conname IN ('reserva_rango_horario_chk', 'reserva_no_solapamiento_excl');

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('reserva', 'pago_reserva')
  AND indexname IN ('idx_reserva_usuario_idempotency_key', 'idx_pago_reserva_idemp_op');

-- =============================================================================
-- PASO 4: ROLLBACK SEGURO (Ejecutar solo si se requiere revertir sin pérdida de datos)
-- =============================================================================
-- BEGIN;
-- ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS reserva_no_solapamiento_excl;
-- ALTER TABLE public.reserva DROP CONSTRAINT IF EXISTS reserva_rango_horario_chk;
-- DROP INDEX IF EXISTS public.idx_reserva_usuario_idempotency_key;
-- DROP INDEX IF EXISTS public.idx_pago_reserva_idemp_op;
-- DROP FUNCTION IF EXISTS public.reserva_intervalo_ts(DATE, TIME, TIME);
-- COMMIT;
