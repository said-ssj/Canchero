import { AdminAlertPreferences } from '@core/services/admin-alert-preferences.service';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminContext } from '../admin-context.service';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { firstValueFrom } from 'rxjs';
import type { Venue } from '@shared/models/venue.model';
import {
  ALERTAS_SISTEMA_DEFINICION,
  type AlertaOperativaConfig,
  type AlertaOperativaTipo,
  type CuentaBancariaItem,
  type FrecuenciaLiquidacion,
  type ComprobanteLiquidacionItem,
} from './admin-configuracion.models';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export type SeccionConfiguracion =
  'cuenta' | 'seguridad' | 'sesiones' | 'notificaciones' | 'reservas' | 'comision';

@Component({
  standalone: true,
  selector: 'app-admin-configuracion',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
  ],
  templateUrl: './admin-configuracion.html',
  styleUrl: './admin-configuracion.css',
})
export class AdminConfiguracion {
  private readonly context = inject(AdminContext);
  protected readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);
  private readonly router = inject(Router);

  // Sección activa en la navegación segmentada
  readonly seccionActiva = signal<SeccionConfiguracion>('cuenta');

  readonly seccionesConfiguracion: Array<{ id: SeccionConfiguracion; label: string }> = [
    { id: 'cuenta', label: 'Datos de la cuenta' },
    { id: 'seguridad', label: 'Seguridad' },
    { id: 'sesiones', label: 'Seguridad de sesiones & cuenta' },
    { id: 'notificaciones', label: 'Notificaciones' },
    { id: 'reservas', label: 'Reservas presenciales' },
    { id: 'comision', label: 'Comisión y liquidación' },
  ];

  setSeccion(seccion: string): void {
    if (
      ['cuenta', 'seguridad', 'sesiones', 'notificaciones', 'reservas', 'comision'].includes(
        seccion,
      )
    ) {
      this.seccionActiva.set(seccion as SeccionConfiguracion);
    }
  }

  // Inputs
  readonly duenoIdInput = input<string | number | null | undefined>(undefined, {
    alias: 'duenoId',
  });
  readonly duenoId = computed(() =>
    this.duenoIdInput() !== undefined ? this.duenoIdInput()! : this.context.ownerId(),
  );
  readonly venueIdInput = input<number | null | undefined>(undefined, { alias: 'venueId' });
  readonly venueId = computed(() =>
    this.venueIdInput() !== undefined ? this.venueIdInput()! : (this.context.venue()?.id ?? null),
  );
  readonly venueInput = input<Venue | null | undefined>(undefined, { alias: 'venue' });
  readonly venue = computed(() =>
    this.venueInput() !== undefined ? this.venueInput()! : (this.context.venue() ?? null),
  );
  readonly venuesInput = input<Venue[] | undefined>(undefined, { alias: 'venues' });
  readonly venues = computed(() =>
    this.venuesInput() !== undefined ? this.venuesInput()! : this.context.venues(),
  );
  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loading = computed(() =>
    this.loadingInput() !== undefined ? this.loadingInput()! : this.context.loading(),
  );
  readonly errorInput = input<string | undefined>(undefined, { alias: 'error' });
  readonly error = computed(() =>
    this.errorInput() !== undefined ? this.errorInput()! : this.context.error(),
  );

  // Outputs
  readonly notice = output<string>();
  readonly selectVenue = output<string | number>();
  readonly addVenue = output<void>();
  readonly navigateTab = output<string>();

  // Datos reactivos de perfil y cuenta matriz
  protected readonly perfilEmail = computed(() => {
    return this.auth.currentUser()?.email || '';
  });

  protected readonly perfilTelefono = computed(() => {
    return this.auth.currentUser()?.telefono || '';
  });

  protected readonly titularRazonSocial = computed(() => {
    const v = this.venue();
    return this.auth.currentUser()?.nombre || '';
  });

  protected readonly rucFacturacion = computed(() => {
    return this.venue()?.ruc_facturacion || 'Sin registrar';
  });

  // Estado del formulario de cambio de contraseña
  protected readonly pwdCurrent = signal<string>('');
  protected readonly pwdNew = signal<string>('');
  protected readonly pwdConfirm = signal<string>('');
  protected readonly showPwdCurrent = signal<boolean>(false);
  protected readonly showPwdNew = signal<boolean>(false);
  protected readonly pwdUpdating = signal<boolean>(false);
  protected readonly pwdError = signal<string>('');
  protected readonly pwdSuccess = signal<string>('');

  // Fortaleza de la contraseña calculada
  protected readonly passwordStrength = computed(() => {
    const p = this.pwdNew();
    if (!p) return { score: 0, label: 'Vacía', colorClass: 'bg-outline-variant' };
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;

    if (score <= 1) return { score: 1, label: 'Débil', colorClass: 'bg-error' };
    if (score === 2) return { score: 2, label: 'Media', colorClass: 'bg-pitch-orange' };
    if (score === 3) return { score: 3, label: 'Fuerte', colorClass: 'bg-turf-green' };
    return { score: 4, label: 'Muy Fuerte', colorClass: 'bg-turf-green' };
  });

  private readonly alertPreferences = inject(AdminAlertPreferences);

  // Alertas operativas internas del sistema (Regla: no simular WhatsApp/Email externos)
  protected readonly alertasDefinicion: AlertaOperativaConfig[] = ALERTAS_SISTEMA_DEFINICION;
  protected readonly alertasOperativas = computed(() => this.alertPreferences.get(this.venueId()));

  // Cuentas bancarias de depósito y liquidaciones
  protected readonly cuentasBancarias = signal<CuentaBancariaItem[]>([]);
  protected readonly cuentaBancariaSeleccionada = signal<string>('bcp');
  protected readonly frecuenciaPago = signal<FrecuenciaLiquidacion>('Semanal (Lunes)');
  protected readonly comprobantesHistorial = signal<ComprobanteLiquidacionItem[]>([]);

  // Modales de control
  protected readonly modalAyudaOpen = signal<boolean>(false);
  protected readonly modalEditarPerfilOpen = signal<boolean>(false);
  protected readonly modalNuevaCuentaOpen = signal<boolean>(false);
  protected readonly modalConfirmarLogoutOpen = signal<boolean>(false);
  protected readonly modalEliminarCuentaOpen = signal<boolean>(false);

  // Formulario de edición de perfil
  protected readonly editNombre = signal<string>('');
  protected readonly editTelefono = signal<string>('');
  protected readonly editRuc = signal<string>('');

  // Formulario de nueva cuenta bancaria
  protected readonly nuevaCuentaBanco = signal<string>('BBVA');
  protected readonly nuevaCuentaTipo = signal<string>('Cuenta Corriente Soles');
  protected readonly nuevaCuentaNumero = signal<string>('');
  protected readonly nuevaCuentaCci = signal<string>('');

  protected readonly depositPercent = signal(50);
  protected readonly savingDeposit = signal(false);
  protected readonly settingsFeedback = signal('');
  private preferencesVenue: number | null = null;
  protected async saveDeposit(): Promise<void> {
    const id = Number(this.venueId()),
      value = this.depositPercent();
    if (!id || this.savingDeposit()) return;
    if (!Number.isInteger(value) || value < 10 || value > 90) {
      this.settingsFeedback.set('Elige un porcentaje entero entre 10 y 90.');
      return;
    }
    this.savingDeposit.set(true);
    this.settingsFeedback.set('');
    try {
      await this.db.updateSedeAdelantoMinimo(id, value);
      this.settingsFeedback.set('Adelanto presencial guardado para esta sede.');
    } catch (e: any) {
      this.settingsFeedback.set(e?.error?.message || 'No se pudo guardar el adelanto.');
    } finally {
      this.savingDeposit.set(false);
    }
  }

  constructor() {
    effect(() => {
      const id = Number(this.venueId());
      if (!id || id === this.preferencesVenue) return;
      this.preferencesVenue = id;
      void this.db
        .getVenuePreferences?.(id)
        .then((value) => {
          if (id === Number(this.venueId())) this.depositPercent.set(value.minimumDepositPercent);
        })
        .catch(() => this.settingsFeedback.set('No se pudieron cargar los ajustes de la sede.'));
    });

    // Inicializar valores de edición al cambiar venue o auth
    effect(() => {
      const u = this.auth.currentUser();
      const v = this.venue();
      if (u) {
        this.editNombre.set(v?.nombre || '');
        this.editTelefono.set(u.telefono || v?.telefono || '');
      }
      if (v?.ruc_facturacion) {
        this.editRuc.set(v.ruc_facturacion);
      }
    });
  }

  // ===== ACCIONES DE CONTRASEÑA =====

  protected toggleShowPwdCurrent(): void {
    this.showPwdCurrent.update((v) => !v);
  }

  protected toggleShowPwdNew(): void {
    this.showPwdNew.update((v) => !v);
  }

  async guardarNuevaPassword(): Promise<void> {
    this.pwdError.set('');
    this.pwdSuccess.set('');

    const actual = this.pwdCurrent();
    const nuevo = this.pwdNew();

    if (!actual) {
      this.pwdError.set('Ingresa tu contraseña actual.');
      return;
    }
    if (nuevo.length < 8) {
      this.pwdError.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (actual === nuevo) {
      this.pwdError.set('La nueva contraseña no puede ser idéntica a la anterior.');
      return;
    }
    if (nuevo !== this.pwdConfirm()) {
      this.pwdError.set('Las contraseñas nuevas no coinciden.');
      return;
    }

    this.pwdUpdating.set(true);

    try {
      await firstValueFrom(this.auth.changePassword(actual, nuevo));
      this.pwdSuccess.set('Contraseña actualizada correctamente.');
      this.notice.emit('Contraseña actualizada en Canchero.');
      this.pwdCurrent.set('');
      this.pwdNew.set('');
      this.pwdConfirm.set('');
    } catch (err: unknown) {
      const msg =
        (err as any)?.error?.message || (err instanceof Error ? err.message : 'Error inesperado');
      this.pwdError.set(`No se pudo procesar la solicitud: ${msg}`);
    } finally {
      this.pwdUpdating.set(false);
    }
  }

  // ===== ALERTAS OPERATIVAS INTERNAS =====

  protected alertaOperativaActiva(tipo: AlertaOperativaTipo): boolean {
    return !!this.alertasOperativas()[tipo];
  }

  protected toggleAlertaOperativa(tipo: AlertaOperativaTipo): void {
    const nextVal = !this.alertasOperativas()[tipo];
    if (!this.alertPreferences.set(this.venueId(), tipo, nextVal)) {
      this.notice.emit('No se pudo guardar la preferencia en este navegador.');
      return;
    }
    this.notice.emit(`Alerta interna ${nextVal ? 'activada' : 'desactivada'} en este navegador.`);
  }

  protected guardarPreferenciasAlertas(showNotice = true): void {
    if (showNotice)
      this.notice.emit(
        'La campana usa estas preferencias en este navegador, para tu cuenta y sede.',
      );
  }

  // ===== MULTISEDE =====

  protected onSelectVenue(venueId: string | number): void {
    if (typeof this.db?.setSedeOperativaId === 'function') {
      this.db.setSedeOperativaId(Number(venueId));
    }
    this.selectVenue.emit(venueId);
    this.notice.emit(`Cambiando administración a la sede #${venueId}.`);
  }

  protected onAddVenue(): void {
    this.addVenue.emit();
    void this.router.navigate(['/admin/sedes'])?.catch(() => {});
  }

  // ===== LIQUIDACIÓN Y CUENTAS BANCARIAS =====

  protected seleccionarCuentaBancaria(id: string): void {
    this.cuentaBancariaSeleccionada.set(id);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('canchero_payout_bank', id);
      } catch {}
    }
    const cuenta = this.cuentasBancarias().find((c) => c.id === id);
    this.notice.emit(`Cuenta bancaria de depósito configurada: ${cuenta?.banco || id}.`);
  }

  protected cambiarFrecuenciaPago(freq: FrecuenciaLiquidacion): void {
    this.frecuenciaPago.set(freq);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('canchero_payout_freq', freq);
      } catch {}
    }
    this.notice.emit(`Frecuencia de liquidaciones programada: ${freq}.`);
  }

  protected abrirAgregarCuentaBancaria(): void {
    this.nuevaCuentaNumero.set('');
    this.nuevaCuentaCci.set('');
    this.modalNuevaCuentaOpen.set(true);
  }

  protected guardarNuevaCuentaBancaria(): void {
    const banco = this.nuevaCuentaBanco().trim();
    const numero = this.nuevaCuentaNumero().trim();
    const cci = this.nuevaCuentaCci().trim();

    if (!numero || numero.length < 8) {
      this.notice.emit('Ingresa un número de cuenta válido.');
      return;
    }

    const nuevaId = banco.toLowerCase().replace(/\s+/g, '-');
    const enmascarado = `•••• ${numero.slice(-4)}`;

    const nuevaCuenta: CuentaBancariaItem = {
      id: nuevaId,
      banco,
      tipo: this.nuevaCuentaTipo(),
      numeroEnmascarado: enmascarado,
      cci: cci || 'No especificado',
      esPrincipal: false,
    };

    this.cuentasBancarias.update((list) => [...list, nuevaCuenta]);
    this.cuentaBancariaSeleccionada.set(nuevaId);
    this.modalNuevaCuentaOpen.set(false);
    this.notice.emit(`Cuenta ${banco} agregada y seleccionada para liquidaciones.`);
  }

  // ===== DESCARGA DE COMPROBANTES DE LIQUIDACIÓN (REQUISITO: Sin comprobantes PDF ficticios) =====

  protected descargarComprobanteTxt(comprobante: ComprobanteLiquidacionItem): void {
    const v = this.venue();
    const contenido = [
      '================================================================',
      '           CANCHERO - COMPROBANTE DE LIQUIDACIÓN INTERNA         ',
      '================================================================',
      `Código de Liquidación : ${comprobante.codigo}`,
      `Período Contable      : ${comprobante.periodo}`,
      `Fecha de Liquidación  : ${comprobante.fecha}`,
      `Titular / Sede        : ${v?.nombre ?? 'Sede Principal'}`,
      `RUC                   : ${v?.ruc_facturacion ?? 'No registrado'}`,
      `Cuenta de Destino     : ${this.cuentaBancariaSeleccionada().toUpperCase()}`,
      '----------------------------------------------------------------',
      `Alquileres Brutos     : S/ ${comprobante.alquileresBrutos.toFixed(2)}`,
      `Comisión registrada   : -S/ ${comprobante.comisionMonto.toFixed(2)}`,
      '----------------------------------------------------------------',
      `NETO LIQUIDADO        : S/ ${comprobante.netoTransferido.toFixed(2)}`,
      '================================================================',
      'Nota: Documento oficial de control interno de liquidaciones bancarias.',
      'Canchero Perú - Plataforma de Gestión Deportiva.',
    ].join('\n');

    this.descargarArchivo(
      contenido,
      `Liquidacion-${comprobante.codigo}.txt`,
      'text/plain;charset=utf-8',
    );
    this.notice.emit(`Comprobante ${comprobante.codigo} descargado en formato de texto.`);
  }

  protected descargarComprobanteXml(comprobante: ComprobanteLiquidacionItem): void {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ComprobanteLiquidacion>
  <Codigo>${comprobante.codigo}</Codigo>
  <Periodo>${comprobante.periodo}</Periodo>
  <Fecha>${comprobante.fecha}</Fecha>
  <Moneda>PEN</Moneda>
  <AlquileresBrutos>${comprobante.alquileresBrutos.toFixed(2)}</AlquileresBrutos>
  <ComisionTasa>0.05</ComisionTasa>
  <ComisionMonto>${comprobante.comisionMonto.toFixed(2)}</ComisionMonto>
  <NetoTransferido>${comprobante.netoTransferido.toFixed(2)}</NetoTransferido>
</ComprobanteLiquidacion>`;

    this.descargarArchivo(
      xml,
      `Liquidacion-${comprobante.codigo}.xml`,
      'application/xml;charset=utf-8',
    );
    this.notice.emit(`Archivo XML de liquidación ${comprobante.codigo} descargado.`);
  }

  private descargarArchivo(contenido: string, filename: string, mimeType: string): void {
    const blob = new Blob([contenido], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== CIERRE DE SESIÓN & SEGURIDAD (REQUISITO: Sin confirmaciones falsas) =====

  protected solicitarCierreSesion(): void {
    this.modalConfirmarLogoutOpen.set(true);
  }

  async confirmarCierreSesion(): Promise<void> {
    this.modalConfirmarLogoutOpen.set(false);
    this.notice.emit('Cerrando sesión en el sistema...');
    try {
      await this.auth.logout();
      await this.router.navigate(['/login']);
    } catch {
      window.location.href = '/login';
    }
  }

  protected solicitarEliminacionCuenta(): void {
    this.modalEliminarCuentaOpen.set(true);
  }

  protected confirmarSolicitudEliminacion(): void {
    // There is no account-deletion endpoint: never announce a simulated request.
    return;
  }

  // ===== EDICIÓN DE PERFIL & DATOS DE LA SEDE =====

  protected abrirEditarPerfil(): void {
    const u = this.auth.currentUser();
    const v = this.venue();
    this.editNombre.set(v?.nombre || '');
    this.editTelefono.set(u?.telefono || v?.telefono || '');
    this.editRuc.set(v?.ruc_facturacion || '');
    this.modalEditarPerfilOpen.set(true);
  }

  protected async guardarEdicionPerfil(): Promise<void> {
    const nombre = this.editNombre().trim();
    const telefono = this.editTelefono().trim();
    const ruc = this.editRuc().trim();

    if (!nombre) {
      this.notice.emit('El nombre o razón social es obligatorio.');
      return;
    }

    const v = this.venue();
    if (!v || !this.duenoId()) {
      this.notice.emit('Selecciona una sede antes de guardar.');
      return;
    }
    if (v && this.duenoId()) {
      try {
        await this.db.saveOrUpdateSede(this.duenoId()!, {
          ...v,
          nombre,
          telefono,
          ruc_facturacion: ruc,
        });
      } catch (error) {
        this.notice.emit(
          (error as any)?.error?.message ||
            (error as any)?.message ||
            'No se pudieron guardar los datos. Intenta nuevamente.',
        );
        return;
      }
    }

    this.modalEditarPerfilOpen.set(false);
    this.notice.emit('Nombre, RUC y contacto de la sede guardados correctamente.');
  }

  // ===== GUARDADO GENERAL =====

  protected guardarConfiguracionGeneral(): void {
    this.guardarPreferenciasAlertas(false);
    this.notice.emit(
      'Preferencias de alertas guardadas en este navegador. Los datos de la sede se guardan desde cada sección.',
    );
  }

  protected abrirCentroAyuda(): void {
    this.modalAyudaOpen.set(true);
  }

  protected irAPersonalizacion(): void {
    this.navigateTab.emit('view-qr');
    void this.router.navigate(['/admin/personalizacion'])?.catch(() => {});
  }
}
