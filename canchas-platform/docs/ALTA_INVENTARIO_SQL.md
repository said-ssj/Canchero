# Alta Inicial de Inventario

## Comprobacion 2026-10-19

Lectura JDBC readOnly y rollback en Supabase, sin altas ni modificaciones:

- Sede54, GRAS SINTETICO BALON DE FUEGO, activa y propiedad de la cuenta esperada.
- Cero movimientos Kardex, activos o inactivos, en esa sede.
- Cero productos asociados a la sede a traves de Kardex.
- Catalogo general producto: 960 registros activos. No constituyen inventario de sede54 ni se les atribuye propietario a partir de ese conteo.

El modelo actual usa producto como catalogo y kardex.id_sede para relacionar existencias. Insertar solamente producto no hace que aparezca en el POS de una sede.

Plantilla validada en PostgreSQL WASM/PGlite local con datos desechables: siete comprobaciones correctas, incluyendo rechazo sin completar, propietario/categoria incorrectos, alta confinada a la sede, reintento sin duplicado, stock positivo y rollback del producto si falla Kardex. Esta validacion no inserta ni certifica un alta real en Supabase.

## Plantilla

Abrir [plantilla SQL](sql/plantilla_alta_producto_sede.sql). NO se ejecuto contra Supabase.

1. Confirmar el proyecto correcto en SQL Editor. Completar el bloque DECLARE con correo del propietario, categoria, codigo interno, nombre, costo, precio y unidades fisicas verificadas.
2. Usar un codigo interno unico por producto, por ejemplo con prefijo SEDE54-, sin presentar ese codigo como un codigo de barras comercial oficial. No reutilizar IDs/codigos del catalogo general a ciegas.
3. Cambiar v_confirmar a true solo con los datos completos. Ejecutar TODO el bloque BEGIN/DO/COMMIT junto. Los valores sin completar generan error y evitan insertar.
4. Si se recibe un error, ROLLBACK y corregir antes de reintentar. Si existe el codigo o nombre en la sede, detenerse y revisar, no hacer UPDATE global ni borrar movimientos.
5. La consulta final verifica sede54; si se prepara una plantilla para otra sede autorizada, cambiar tambien su filtro final.
6. Para otro producto, completar una nueva alta con codigo diferente. Para reponer el mismo producto, NO repetir esta plantilla: se requiere un ingreso sobre el producto existente y saldo anterior, no otro stock inicial.
7. Refrescar POS. El cobro seguira bloqueado mientras no exista turno abierto; crear inventario no abre caja ni registra ventas.

Categorias activas observadas:

| ID | Nombre |
| --- | --- |
| 1 | Bebidas Rehidratantes |
| 2 | Snacks y Aperitivos |
| 3 | Indumentaria Menor |
| 4 | Accesorios de Utilidad |

Tipo de ingreso observado: tipo_movimiento_inv.id_tipo_mov_inv=1, Compra a Proveedor. La plantilla se detiene si el catalogo no coincide.

Cada alta crea un ID de producto nuevo y su unico saldo inicial en sede54. No cambia precios, existencias ni movimientos de productos previos. No habilita el boton pendiente de ingreso de mercaderia ni implementa un catalogo independiente por propietario: para uso cotidiano sigue pendiente completar esa interfaz y revisar los filtros de categoria contra los IDs reales.

Las secuencias se dejaron intactas. En la comprobacion, producto llegaba a960 y su secuencia a960; kardex estaba vacio y su secuencia a4. Los huecos de secuencia no implican productos perdidos y no justifican reiniciarlas.
