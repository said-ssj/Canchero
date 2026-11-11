# Ajustes de interfaces — 2026-11-11

Implementado localmente:
- Checkout: resumen sticky limitado a la altura visible, detalles con desplazamiento interno y acción fuera del desplazamiento. Verificado a 1531×668 al 100%: botón lateral dentro del viewport tras desplazarse por el calendario. Campo de cupos Angular Material y aviso de prueba abreviado.
- Accesos: ruta /admin/accesos conserva panel y sede; /accesos permanece para enlaces QR del personal. Botones Material y colores semánticos. No se confirmó ningún ingreso durante QA.
- Login/configuración: ojo dentro del sufijo Material, sin posición absoluta, marco ni fondo; área de iconos compacta y foco visible.
- Panel: tokens de superficies para catálogo/inventario/compras/POS, tablas Material en oscuro, destinos POS centrados, notificaciones sin desplazamiento horizontal. Eliminado icono decorativo del vacío de compras. Sin hover añadido.
- Sedes móvil: oculto selector lista/cuadrícula y fotos/tarjetas más compactas.
- Finanzas: selector real de fechas con validación y filtro inclusivo; se usa comisión registrada, no un 5% inventado. Los movimientos de caja disponibles corresponden al turno activo (la fecha de dicho turno se usa en el filtro), no a un historial completo de caja.
- Personalización: textos y datos informativos de billetera se guardan mediante API. El celular de billetera no reemplaza al contacto público; estos metadatos no vinculan Yape/Plin ni cambian al receptor de Mercado Pago. Colores y QR personalizado siguen como vista previa local.
- Seguridad: PUT /api/account/password autentica cuenta Canchero y comprueba contraseña actual antes de bcrypt/CAS. No cambia la contraseña de Google. Verificado en BD temporal; no se cambiaron claves reales durante QA.
- Adelanto: GET/PUT /api/venues/{id}/preferences guarda porcentaje presencial 10–90 por sede y comprueba permisos. Online sigue al 100%. La configuración persistida no implementa por sí sola el módulo de reservas presenciales que sigue pendiente.
- Configuración financiera: retiradas cuentas bancarias/liquidaciones de muestra y presentación de comisión automática. Se explica alcance actual de Checkout Pro en prueba, sin transferencias automáticas a dueños.

BD: migración aditiva 20261111062000_preferencias_sede.sql aplicada y verificada: 44 sedes, valor inicial 50%, billeteras vacías, RLS existente conservado. No se alteraron reservas, pagos ni credenciales reales.

Validación: build y typecheck Angular pasan; 78 pruebas de checkout/configuración/personalización/finanzas y 3 pruebas PostgreSQL nuevas aprobadas. Suite web completa: 329/335, seis fallos en pruebas de perfiles, búsqueda y alcance superadmin; no se declara toda la suite aprobada. La suite general de API tenía además fallos previos de caja/roles documentados en la guía de Mercado Pago. Sin commit, push ni despliegue.
