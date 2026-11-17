import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '@env/environment';

@Component({
  selector: 'app-terminos',
  imports: [RouterLink],
  styleUrl: './legal.css',
  template: `
    <article class="legal-page">
      <header class="legal-header">
        <span class="legal-badge">Información Legal</span>
        <h1 class="legal-title">Términos y Condiciones</h1>
        <p class="legal-date">Actualizados: 17 de noviembre de 2026 · Lima, Perú</p>
      </header>

      <section class="legal-section">
        <h2>1. Alcance y proveedor</h2>
        <p>
          Canchero facilita la búsqueda y reserva de instalaciones deportivas. La sede que presta
          físicamente el servicio puede ser operada por un tercero independiente. Antes de confirmar
          una reserva, revisa quién la presta, las reglas de ingreso y las condiciones particulares
          mostradas para esa sede.
        </p>
        @if (business.name || business.taxId) {
          <p>
            Operador de la plataforma: {{ business.name || 'dato pendiente' }}
            @if (business.taxId) {
              · RUC {{ business.taxId }}
            }
          </p>
        }
      </section>

      <section class="legal-section">
        <h2>2. Reservas y precio</h2>
        <p>
          Una reserva se considera confirmada cuando Canchero muestra el estado confirmado y genera
          el pase correspondiente. Antes de pagar, verifica sede, cancha, fecha, horario, duración y
          el precio total que aparece en el resumen. No confirmes si el importe o las condiciones no
          coinciden con lo que esperabas; contacta a la sede o al soporte antes de continuar.
        </p>
        <p>
          La disponibilidad y las instalaciones son responsabilidad de quien presta el servicio.
          Canchero facilita la coordinación y comunica el estado que recibe del sistema y la sede.
        </p>
      </section>

      <section class="legal-section">
        <h2>3. Cancelaciones, cambios y devoluciones</h2>
        <p>
          Las condiciones aplicables dependen de la sede y del método de pago. Revisa las
          condiciones específicas presentadas antes de confirmar la reserva y conserva el
          comprobante. No se garantiza una devolución automática por cancelar, reprogramar o no
          asistir.
        </p>
        <p>
          Si la sede cancela o no puede prestar el servicio, contacta a la sede y a Canchero para
          registrar el caso y conocer las alternativas que correspondan. Una reprogramación o saldo
          a favor no sustituye una devolución cuando esta resulte exigible. El tiempo y método de
          devolución dependen también del proveedor de pago.
        </p>
      </section>

      <section class="legal-section">
        <h2>4. Pagos</h2>
        <p>
          Los medios de pago disponibles se indican durante la compra. Si se usa un proveedor
          externo, el procesamiento se rige también por sus condiciones. No compartas por mensajes o
          formularios de Canchero el número completo de tarjeta ni el código de seguridad.
        </p>
      </section>

      <section class="legal-section">
        <h2>5. Uso responsable</h2>
        <p>
          Debes proporcionar información veraz, mantener protegidas tus credenciales, respetar el
          horario y cumplir las reglas de seguridad y convivencia comunicadas por la sede. No uses
          la plataforma para fraude, acoso, suplantación o actividades ilegales.
        </p>
      </section>

      <section class="legal-section">
        <h2>6. Reclamaciones y soporte</h2>
        <p>
          Para reportar un problema con una reserva, utiliza los canales de soporte de Canchero y
          conserva los datos de la operación. La información de contacto y el enlace al Libro de
          Reclamaciones deben estar habilitados por el operador antes de ofrecer el servicio al
          público.
        </p>
      </section>

      <section class="legal-section">
        <h2>7. Privacidad</h2>
        <p>
          El tratamiento de datos personales se describe en la
          <a routerLink="/privacidad">Política de Privacidad</a>. Las preferencias opcionales de
          promociones se gestionan por separado y pueden retirarse desde Mi cuenta.
        </p>
      </section>

      <div class="legal-footer-links">
        <a routerLink="/" class="legal-back-btn">
          <span aria-hidden="true">←</span>
          <span>Volver al inicio</span>
        </a>
        <a routerLink="/privacidad" class="legal-back-btn">
          <span>Ver Política de Privacidad</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  `,
})
export class TermsPage {
  protected readonly business = environment.business;
}

export { TermsPage as Terminos };
