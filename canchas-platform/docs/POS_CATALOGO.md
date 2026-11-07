# Alta de productos y categorías

Implementado localmente el 2026-11-07. Entrada: Administración > Punto de Venta > Agregar producto.

- Nombre, categoría existente o nueva, código de barras/SKU opcional y descripción opcional.
- Contenido por unidad y unidad de medida: und, ml, l, g, kg, pack o caja.
- Precios de compra y venta, stock inicial y stock mínimo.
- Foto opcional: archivo JPG/PNG/WebP hasta 5 MB o enlace HTTPS. El archivo se reduce a JPEG de hasta 600 px y 250.000 caracteres; se guarda en producto.foto_url como data URL. Los enlaces se guardan como URL. Esta entrega no crea un bucket de Storage.
- La cantidad en Kardex y carrito sigue siendo un entero de unidades de venta; el contenido describe cada unidad (por ejemplo 600 ml).

## Persistencia y aislamiento

Aplicada en Supabase la migración aditiva docs/sql/pos_catalogo_productos.sql. Conserva los productos y movimientos existentes. Agrega contenido, unidad_medida, descripcion y foto_url a producto, e id_sede a categoria_producto. Las categorías antiguas con id_sede NULL siguen compartidas; las nuevas pertenecen a una sede.

Rutas autenticadas de propietario, bajo /api/pos/catalog:

- GET /categories?sedeId=...
- POST /categories: sedeId, nombre, descripcion.
- POST /products: sedeId, categoriaId, nombre, codigoBarras, descripcion, contenido, unidadMedida, precioCompra, precioVenta, stockInicial, stockMinimo, fotoUrl.

VenueAccessService comprueba al dueño en cada solicitud. El alta de producto y su entrada inicial en Kardex se guardan en una sola transacción, incluso con stock cero. El catálogo continúa filtrándose por el Kardex de la sede; no se enlaza inventario de otros dueños. Se rechazan categorías ajenas, precios inválidos y códigos repetidos en la sede; el bloqueo de la sede serializa altas simultáneas.

Los filtros del POS ahora usan las categorías de la API; Todas usa el ID 0 para no confundirse con una categoría real.

## Verificación

- Compilación Angular y typecheck correctos.
- 19 pruebas frontend POS/editor correctas.
- 26 pruebas existentes de aislamiento POS/operaciones legacy correctas.
- 4 pruebas en PostgreSQL temporal: alta persistente con stock cero y foto, aislamiento entre dueños/categorías, código duplicado simultáneo y rollback si falla el movimiento inicial.
- Navegador local: carga de 40 productos, categorías reales, formulario centrado, navegación a nueva categoría y campo de enlace de foto comprobados.
- En la BD compartida solo se aplicó estructura; no se agregaron productos de prueba.
- API local reiniciada en 8090. La verificación descrita corresponde al entorno local; no certifica el despliegue en Render/Vercel.
