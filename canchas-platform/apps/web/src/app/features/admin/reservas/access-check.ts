import { MatButtonModule } from '@angular/material/button';
import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import jsQR from 'jsqr';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule],
  template: `<main class="access-check">
    <a routerLink="/admin/reservas">Volver a reservas</a>
    <section>
      <h1>Control de accesos</h1>
      <p>
        Escanea el pase y confirma un ingreso por persona. La verificación utiliza la reserva y los
        cupos guardados en el servidor.
      </p>
      @if (!auth.isLoggedIn()) {
        <a routerLink="/login" [queryParams]="{ returnUrl: '/accesos' }"
          >Inicia sesión como personal autorizado</a
        >
      }
      <video
        #video
        muted
        playsinline
        [hidden]="!camera()"
        aria-label="Cámara para leer el QR"
      ></video>
      <div class="actions">
        <button
          mat-stroked-button
          disableRipple
          type="button"
          [disabled]="!auth.isLoggedIn() || busy()"
          (click)="startCamera()"
        >
          Abrir cámara</button
        ><button
          mat-stroked-button
          disableRipple
          type="button"
          [disabled]="!camera()"
          (click)="stopCamera()"
        >
          Detener cámara
        </button>
      </div>
      <label
        >Pase o enlace del QR<textarea
          rows="3"
          [(ngModel)]="tokenInput"
          (ngModelChange)="newScan()"
          autocomplete="off"
          spellcheck="false"
        ></textarea>
      </label>
      <p>
        Un escaneo compartido consume un cupo. Salir y volver a entrar requiere revisión del
        personal.
      </p>
      <button
        mat-stroked-button
        disableRipple
        type="button"
        class="primary"
        [disabled]="busy() || !auth.isLoggedIn() || !tokenInput.trim() || consumed()"
        (click)="confirm()"
      >
        {{ busy() ? 'Verificando…' : 'Confirmar un ingreso' }}
      </button>
      <button
        mat-stroked-button
        disableRipple
        type="button"
        [disabled]="busy()"
        (click)="nextPerson()"
      >
        Siguiente persona
      </button>
      @if (message()) {
        <p role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
    </section>
  </main>`,
  styles: [
    `
      .access-check {
        max-width: 720px;
        margin: 8px auto;
        padding: 0 20px;
        min-height: 0;
      }
      section {
        padding: 24px;
        margin-top: 16px;
        border: 1px solid var(--line, #ddd);
        border-radius: 6px;
      }
      h1 {
        font-size: 26px;
      }
      label,
      textarea {
        display: block;
        width: 100%;
        box-sizing: border-box;
      }
      textarea {
        resize: vertical;
        padding: 12px;
        margin: 8px 0;
        background: var(--page, #fff);
        color: var(--ink);
        border: 1px solid var(--line, #ddd);
        border-radius: 6px;
      }
      button {
        padding: 10px 14px;
        border: 1px solid var(--line, #ddd);
        border-radius: 6px;
        margin: 6px 8px 6px 0;
        background: var(--surface);
        color: var(--ink);
      }
      button:disabled {
        background: #e5e7eb;
        color: #6b7280;
      }
      .primary {
        background: #25832a;
        color: white;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
      }
      video {
        width: 100%;
        max-height: 320px;
      }
      .error {
        color: #b42318;
      }
    `,
  ],
})
export class AccessCheck {
  @ViewChild('video') private video?: ElementRef<HTMLVideoElement>;
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  protected tokenInput = '';
  protected readonly camera = signal(false);
  protected readonly busy = signal(false);
  protected readonly consumed = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  private stream?: MediaStream;
  private frame = 0;
  private requestId = crypto.randomUUID();
  constructor() {
    this.destroy.onDestroy(() => this.stopCamera());
    if (window.location.hash) {
      this.tokenInput = decodeURIComponent(window.location.hash.slice(1));
      history.replaceState(null, '', window.location.pathname);
    }
  }
  newScan() {
    this.requestId = crypto.randomUUID();
    this.consumed.set(false);
    this.error.set('');
    this.message.set('');
  }
  nextPerson() {
    this.newScan();
    this.tokenInput = '';
  }
  async confirm() {
    if (this.busy() || this.consumed()) return;
    let token = this.tokenInput.trim();
    if (token.startsWith('https://') || token.startsWith('http://')) {
      try {
        token = new URL(token).hash.slice(1);
      } catch {
        token = '';
      }
    }
    if (!/^CAN1_[A-Za-z0-9_-]{43}$/.test(token)) {
      this.error.set('No es un pase de acceso válido.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.post<{
          cancha: string;
          sede: string;
          usados: number;
          maximo: number;
          repetido: boolean;
        }>(`${environment.apiUrl}/access/scan`, { token, requestId: this.requestId }),
      );
      this.consumed.set(true);
      this.message.set(
        `Ingreso registrado · ${r.sede} · ${r.cancha}. ${r.usados} de ${r.maximo} cupos utilizados.${r.repetido ? ' Reintento reconocido; no se consumió otro cupo.' : ''}`,
      );
    } catch (e: any) {
      this.error.set(
        e?.error?.message ||
          'No se pudo verificar. Reintenta sin cambiar el pase para evitar duplicar un ingreso.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  async startCamera() {
    this.stopCamera();
    this.error.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      const video = this.video?.nativeElement;
      if (!video) {
        this.stopCamera();
        return;
      }
      video.srcObject = this.stream;
      await video.play();
      this.camera.set(true);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!this.camera() || !context) return;
        if (video.readyState >= 2) {
          canvas.width = Math.min(video.videoWidth, 720);
          canvas.height = Math.round((video.videoHeight * canvas.width) / video.videoWidth);
          if (canvas.width && canvas.height) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(pixels.data, pixels.width, pixels.height);
            if (qr) {
              this.tokenInput = qr.data;
              this.newScan();
              this.stopCamera();
              return;
            }
          }
        }
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    } catch {
      this.stopCamera();
      this.error.set('No se pudo abrir la cámara. Permite el acceso o pega el contenido del pase.');
    }
  }
  stopCamera() {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.camera.set(false);
  }
}
