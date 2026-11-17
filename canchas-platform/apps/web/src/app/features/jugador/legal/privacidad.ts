import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '@env/environment';

@Component({
  selector: 'app-privacidad',
  imports: [RouterLink],
  styleUrl: './legal.css',
  template: `
    <article class="legal-page">
      <header class="legal-header">
        <span class="legal-badge">Protección de Datos</span>
        <h1 class="legal-title">Política de Privacidad</h1>
        <p class="legal-date">Actualizada: 17 de noviembre de 2026 · Lima, Perú</p>
      </header>

      <p class="legal-section">
        Esta política describe el tratamiento de datos personales en Canchero, plataforma para
        descubrir y reservar instalaciones deportivas. El proveedor responsable es
        @if (business.name) {
          <strong>{{ business.name }}</strong>
        } @else {
          <strong>la persona o empresa que opera Canchero</strong>
        }
        @if (business.taxId) {
          (RUC {{ business.taxId }})
        }
        . Antes de publicar, deben completarse la identidad y los datos de contacto reales del
        responsable.
      </p>

      <section class="legal-section">
        <h2>1. Datos tratados</h2>
        <ul>
          <li>Cuenta: nombre, correo, teléfono y credenciales gestionadas por Canchero.</li>
          <li>
            Perfil y actividad: datos que agregas al perfil, publicaciones, mensajes, reseñas,
            reservas, horarios y estado de las operaciones.
          </li>
          <li>
            Pagos: datos necesarios para asociar el pago a una reserva. Los datos completos de
            tarjeta deben ser ingresados directamente en la pasarela y no en Canchero.
          </li>
          <li>
            Preferencias: idioma/tema, notificaciones y, si lo autorizas, la preferencia de
            comunicaciones promocionales.
          </li>
          <li>
            Información técnica y de seguridad necesaria para autenticar sesiones, prevenir abuso y
            diagnosticar errores.
          </li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>2. Finalidades y proveedores</h2>
        <p>Usamos los datos para crear y proteger cuentas, gestionar reservas, pagos y soporte,</p>
        <p>
          y enviar comunicaciones operativas relacionadas con esos servicios. Las promociones por
          correo son opcionales: empiezan desactivadas, requieren una autorización separada y puedes
          retirarla desde Mi cuenta.
        </p>
        <p>
          Según las funciones que utilices, los datos pueden procesarse mediante Supabase
          (autenticación, base de datos o archivos), Google (inicio de sesión o mapas), el proveedor
          de alojamiento de Canchero, el servicio de correo, Mercado Pago para pagos y Sentry para
          diagnóstico cuando esté habilitado. Cada proveedor recibe solo la información necesaria
          para su función. La disponibilidad de cada integración puede variar.
        </p>
        <p>
          La ubicación de los centros de datos, transferencias internacionales, plazos de retención
          y contratos aplicables dependen de la configuración real de cada proveedor. El responsable
          debe verificar y publicar esa información antes del lanzamiento.
        </p>
      </section>

      <section class="legal-section">
        <h2>3. Almacenamiento del navegador</h2>
        <p>
          Canchero utiliza almacenamiento local o de sesión del navegador para mantener la sesión,
          preferencias y estados temporales. Los proveedores externos integrados pueden usar
          tecnologías propias necesarias para prestar sus funciones. No habilites publicidad ni
          seguimiento no esencial sin configurar previamente la información y los controles
          correspondientes.
        </p>
      </section>

      <section class="legal-section">
        <h2>4. Conservación y seguridad</h2>
        <p>
          Conservamos la información mientras sea necesaria para prestar el servicio, atender
          solicitudes y cumplir obligaciones aplicables. Los comprobantes y registros de operaciones
          podrían requerir conservación aun después de cerrar una cuenta. Aplicamos controles
          técnicos y organizativos, pero ningún servicio conectado a Internet puede garantizar
          seguridad absoluta.
        </p>
      </section>

      <section class="legal-section">
        <h2>5. Tus derechos y solicitudes</h2>
        <p>
          Puedes solicitar acceso, rectificación o supresión desde Mi cuenta. La solicitud queda
          registrada para revisión; enviarla no borra automáticamente datos ni sustituye la
          verificación y respuesta del responsable. Algunos registros podrían conservarse cuando
          exista una razón legal válida.
        </p>
        <p>
          También puedes retirar tu autorización de promociones desde las preferencias de
          notificaciones. La baja no afecta mensajes necesarios para operar una reserva.
        </p>
      </section>

      <section class="legal-section">
        <h2>6. Marco de referencia</h2>
        <p>
          El tratamiento se rige por la Ley peruana N.° 29733, su reglamento vigente y las demás
          normas aplicables. Esta política debe revisarse con la operación y configuración real de
          Canchero antes de su publicación definitiva.
        </p>
      </section>

      <div class="legal-section">
        <h2>Contacto del responsable</h2>
        @if (business.privacyEmail || business.email) {
          <p>Correo: {{ business.privacyEmail || business.email }}</p>
        } @else {
          <p>El canal de contacto del responsable aún no está configurado.</p>
        }
        @if (business.address) {
          <p>Dirección: {{ business.address }}</p>
        }
      </div>

      <div class="legal-footer-links">
        <a routerLink="/cuenta" class="legal-back-btn">
          <span aria-hidden="true">←</span>
          <span>Ir a Mi Cuenta</span>
        </a>
        <a routerLink="/terminos" class="legal-back-btn">
          <span>Ver Términos y Condiciones</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  `,
})
export class PrivacyPage {
  protected readonly business = environment.business;
}

export { PrivacyPage as Privacidad };
