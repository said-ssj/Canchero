-- PLANTILLA, NO EJECUTADA EN SUPABASE.
-- Revisar proyecto, sede y dueno. Rellenar SOLO el bloque DECLARE.
-- Crea UN producto nuevo y su inventario inicial. No modifica productos existentes.
-- Para reponer un producto existente NO repetir esta alta: usar otro procedimiento.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $alta$
DECLARE
    v_confirmar boolean := false; -- Cambiar a true SOLO tras completar los datos reales.
    v_sede integer := 54;
    v_correo_dueno text := 'REEMPLAZAR_CORREO_DEL_DUENO';
    v_categoria integer := 1; -- 1 Bebidas; 2 Snacks; 3 Indumentaria; 4 Accesorios.
    v_codigo text := 'SEDE54-REEMPLAZAR'; -- Codigo interno UNICO, no un EAN inventado.
    v_nombre text := 'REEMPLAZAR_NOMBRE_DEL_PRODUCTO';
    v_compra numeric := 0.00; -- Costo unitario real en soles.
    v_venta numeric := 0.00; -- Precio unitario real en soles, mayor que cero.
    v_stock integer := 0; -- Unidades fisicas verificadas, mayor que cero.
    v_minimo integer := 5; -- Umbral de alerta, cero o mayor.
    v_producto integer;
BEGIN
    IF NOT v_confirmar THEN
        RAISE EXCEPTION 'Completa los datos reales y cambia v_confirmar a true';
    END IF;
    IF v_sede IS NULL OR v_categoria IS NULL OR v_correo_dueno IS NULL
       OR v_nombre IS NULL OR v_codigo IS NULL
       OR btrim(v_correo_dueno) = '' OR v_correo_dueno ILIKE '%REEMPLAZAR%'
       OR btrim(v_nombre) = '' OR v_nombre ILIKE '%REEMPLAZAR%'
       OR btrim(v_codigo) = '' OR v_codigo ILIKE '%REEMPLAZAR%'
       OR char_length(btrim(v_nombre)) > 150 OR char_length(btrim(v_codigo)) > 50 THEN
        RAISE EXCEPTION 'Revisa sede, categoria, correo, nombre y codigo interno';
    END IF;
    IF v_compra IS NULL OR v_venta IS NULL OR v_stock IS NULL OR v_minimo IS NULL
       OR v_compra < 0 OR v_venta <= 0 OR v_stock <= 0 OR v_minimo < 0
       OR v_compra <> round(v_compra, 2) OR v_venta <> round(v_venta, 2)
       OR v_compra > 9999999999.99 OR v_venta > 9999999999.99
       OR v_compra::text IN ('NaN','Infinity','-Infinity')
       OR v_venta::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Usa importes reales con hasta dos decimales y stock positivo';
    END IF;

    PERFORM s.id_sede FROM public.sede s
      JOIN public.usuario u ON u.id_usuario = s.id_dueno
     WHERE s.id_sede = v_sede AND s.estado = 'A' AND u.estado = 'A'
       AND lower(btrim(u.correo)) = lower(btrim(v_correo_dueno))
     FOR UPDATE OF s;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La sede activa no corresponde al dueno indicado';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.categoria_producto
                    WHERE id_categoria = v_categoria AND estado = 'A') THEN
        RAISE EXCEPTION 'La categoria no existe o esta inactiva';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tipo_movimiento_inv
                    WHERE id_tipo_mov_inv = 1 AND estado = 'A'
                      AND lower(btrim(nombre)) = 'compra a proveedor') THEN
        RAISE EXCEPTION 'Revisar catalogo: el tipo 1 debe ser Compra a Proveedor';
    END IF;

    -- Serializa la comprobacion del codigo con cualquier alta concurrente.
    LOCK TABLE public.producto IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM public.producto
                WHERE lower(btrim(codigo_barras)) = lower(btrim(v_codigo))) THEN
        RAISE EXCEPTION 'El codigo ya existe. No se reutiliza ni modifica ese producto';
    END IF;
    IF EXISTS (SELECT 1 FROM public.producto p JOIN public.kardex k
                  ON k.id_producto = p.id_producto
                WHERE k.id_sede = v_sede
                  AND lower(btrim(p.nombre)) = lower(btrim(v_nombre))) THEN
        RAISE EXCEPTION 'La sede ya tiene ese nombre. Revisar antes de crear un duplicado';
    END IF;

    INSERT INTO public.producto
        (id_categoria, codigo_barras, nombre, precio_compra, precio_venta,
         stock_minimo, estado, usucre, pccre, feccre)
    VALUES
        (v_categoria, btrim(v_codigo), btrim(v_nombre), v_compra, v_venta,
         v_minimo, 'A', 'ALTA_MANUAL', 'SQL_EDITOR', timezone('America/Lima', now()))
    RETURNING id_producto INTO v_producto;

    INSERT INTO public.kardex
        (id_producto, id_sede, id_tipo_mov_inv, cantidad, precio_unitario,
         saldo_stock, motivo, fecha, estado, usucre, pccre, feccre)
    VALUES
        (v_producto, v_sede, 1, v_stock, v_compra, v_stock,
         'Alta inicial manual de inventario - sede ' || v_sede,
         timezone('America/Lima', now()), 'A', 'ALTA_MANUAL', 'SQL_EDITOR',
         timezone('America/Lima', now()));
    RAISE NOTICE 'Producto % creado con % unidades en sede %',
        v_producto, v_stock, v_sede;
END;
$alta$;
COMMIT;

-- Comprobacion de lectura: inventario ACTUAL, no suma de saldos historicos.
SELECT p.id_producto, p.codigo_barras, p.nombre, p.precio_compra, p.precio_venta,
       k.id_sede, k.saldo_stock AS stock_actual
  FROM public.producto p
  JOIN LATERAL (
      SELECT k1.id_sede, k1.saldo_stock FROM public.kardex k1
       WHERE k1.id_producto = p.id_producto AND k1.id_sede = 54 AND k1.estado = 'A'
       ORDER BY coalesce(k1.fecha, k1.feccre) DESC, k1.id_kardex DESC LIMIT 1
  ) k ON true
 WHERE p.estado = 'A'
 ORDER BY p.nombre;
