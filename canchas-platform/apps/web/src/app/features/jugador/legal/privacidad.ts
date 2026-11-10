import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-privacidad',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  styleUrl: './legal.css',
  template: `
    <article class="legal-page">
      <header class="legal-header">
        <span class="legal-badge">Protección de Datos</span>
        <h1 class="legal-title">Política de Privacidad</h1>
        <p class="legal-date">Última actualización: Noviembre 2026 · Lima, Perú</p>
      </header>

      <div class="legal-notice-box" role="note">
        <!-- Pendiente de revisión legal por el equipo de Canchero -->
        <strong>Transparencia:</strong> En Canchero protegemos tu información y te explicamos de
        forma sencilla y veraz qué datos recopilamos y cuál es su finalidad.
      </div>

      <section class="legal-section">
        <h2>1. Datos que recopilamos</h2>
        <p>
          Recopilamos únicamente los datos necesarios para brindarte el servicio de reserva de
          canchas:
        </p>
        <ul>
          <li>
            <strong>Datos de perfil e identificación:</strong> Nombres, apellidos y correo
            electrónico facilitados al registrarte o al iniciar sesión con Google.
          </li>
          <li>
            <strong>Datos de contacto:</strong> Número de teléfono / WhatsApp para enviarte
            confirmaciones y coordinar detalles del partido con la sede.
          </li>
          <li>
            <strong>Historial deportivo y reservas:</strong> Canchas, fechas, horarios y estado de
            tus partidos jugados y programados.
          </li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>2. Pagos y transacciones seguras</h2>
        <p>
          Los pagos electrónicos son procesados a través de pasarelas de pago certificadas (como
          Mercado Pago o pasarelas bancarias autorizadas).
          <strong
            >Canchero nunca almacena el número completo de tu tarjeta de crédito o débito ni tus
            códigos de seguridad CVV.</strong
          >
        </p>
      </section>

      <section class="legal-section">
        <h2>3. Finalidad del tratamiento de datos</h2>
        <p>Utilizamos tu información exclusivamente para:</p>
        <ul>
          <li>Gestionar y validar tus reservas deportivas ante los complejos afiliados.</li>
          <li>Enviarte tu pase digital de ingreso y avisos operativos sobre tu partido.</li>
          <li>
            Permitirte exportar o descargar tus datos en formato digital en cualquier momento.
          </li>
          <li>
            Si lo autorizas expresamente, enviarte promociones y novedades sobre canchas
            disponibles.
          </li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>4. Tus derechos (Acceso, Rectificación y Cancelación)</h2>
        <p>
          Puedes consultar, actualizar o solicitar la baja de tu cuenta directamente desde la
          sección <strong>Mi cuenta</strong>. Si deseas una copia completa de tu información, puedes
          utilizar la opción "Descargar mis datos" dentro de tu panel de cuenta.
        </p>
      </section>

      <div class="legal-footer-links">
        <a routerLink="/cuenta" class="legal-back-btn">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          <span>Ir a Mi Cuenta</span>
        </a>
        <a routerLink="/terminos" class="legal-back-btn">
          <span>Ver Términos y Condiciones</span>
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </a>
      </div>
    </article>
  `,
})
export class PrivacyPage {}
export { PrivacyPage as Privacidad };
