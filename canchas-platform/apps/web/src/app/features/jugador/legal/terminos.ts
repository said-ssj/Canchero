import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-terminos',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  styleUrl: './legal.css',
  template: `
    <article class="legal-page">
      <header class="legal-header">
        <span class="legal-badge">Información Legal</span>
        <h1 class="legal-title">Términos y Condiciones de Uso</h1>
        <p class="legal-date">Última actualización: Noviembre 2026 · Lima, Perú</p>
      </header>

      <div class="legal-notice-box" role="note">
        <!-- Pendiente de revisión legal por el equipo de Canchero -->
        <strong>Nota importante:</strong> Los presentes términos regulan el uso de la plataforma
        digital Canchero para la reserva y administración de canchas deportivas. El texto a
        continuación refleja las condiciones operativas vigentes en fase MVP, pendiente de
        validación legal definitiva.
      </div>

      <section class="legal-section">
        <h2>1. Objeto de la plataforma</h2>
        <p>
          Canchero es una plataforma tecnológica que facilita el contacto, visualización y reserva
          de canchas deportivas (fútbol, vóley, básquet y otros deportes) entre jugadores y los
          complejos o sedes deportivas administradas de forma independiente.
        </p>
      </section>

      <section class="legal-section">
        <h2>2. Reservas y confirmaciones</h2>
        <p>
          Una reserva queda en firme una vez que el usuario recibe la confirmación digital y su
          correspondiente Pase de Reserva con código QR en su Itinerario. Los horarios reservados
          deben respetarse puntualmente para no interferir con los partidos de otros usuarios.
        </p>
      </section>

      <section class="legal-section">
        <h2>3. Cancelaciones y reprogramaciones</h2>
        <p>
          Las políticas de cancelación y reprogramación dependen de las condiciones establecidas por
          cada complejo deportivo:
        </p>
        <ul>
          <li>
            Las solicitudes de reprogramación deben realizarse con al menos 4 horas de anticipación
            al inicio del turno.
          </li>
          <li>
            En caso de suspensión por causas de fuerza mayor o eventos climáticos que hagan inviable
            el partido, la sede ofrecerá una reprogramación sin penalidad.
          </li>
        </ul>
      </section>

      <section class="legal-section">
        <h2>4. Conducta en las instalaciones</h2>
        <p>
          El usuario y los integrantes de su equipo se comprometen a respetar las normas de
          convivencia, seguridad y uso adecuado de la indumentaria requerida (por ejemplo,
          zapatillas para gras sintético) de cada recinto deportivo.
        </p>
      </section>

      <div class="legal-footer-links">
        <a routerLink="/" class="legal-back-btn">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          <span>Volver al inicio</span>
        </a>
        <a routerLink="/privacidad" class="legal-back-btn">
          <span>Ver Política de Privacidad</span>
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </a>
      </div>
    </article>
  `,
})
export class TermsPage {}
export { TermsPage as Terminos };
