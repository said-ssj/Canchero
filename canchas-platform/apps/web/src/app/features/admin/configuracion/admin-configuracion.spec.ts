import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { AdminConfiguracion } from './admin-configuracion';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue } from '@shared/models/venue.model';
import { COMPROBANTES_LIQUIDACION_HISTORIAL } from './admin-configuracion.models';
import { supabase } from '@core/supabase/client';


describe('AdminConfiguracion Component - Etapa 7 (Configuración General & Cuenta)', () => {
  let fixture: ComponentFixture<AdminConfiguracion>;
  let component: AdminConfiguracion;
  let router: Router;

  const mockCurrentUser = signal<{ email: string; nombre: string; rol: string; telefono?: string } | null>({
    email: 'dueno@canchero.pe',
    nombre: 'Dueño Oficial',
    rol: 'dueno',
    telefono: '+51 987 654 321',
  });

  const mockSede: Venue = {
    id: '1',
    nombre: 'Complejo Deportivo Magdalena',
    ciudad: 'Lima',
    distrito: 'Magdalena',
    direccion: 'Av. del Ejército 1230',
    rating: 4.8,
    precioBase: 80,
    fotos: ['https://images.unsplash.com/photo-1529900245534-47fbf822155a?w=800'],
    amenidades: ['Fútbol 7', 'Césped FIFA', 'Estacionamiento'],
    canchas: [],
    descripcion: 'El mejor césped sintético con iluminación LED profesional.',
    telefono: '987 654 321',
    ruc_facturacion: '20601234567',
  };

  const mockDbService = {
    usuarios: signal<any[]>([{ id: 1, email: 'dueno@canchero.pe', rol: 'dueno' }]),
    sedes: signal<Venue[]>([mockSede]),
    getSedesPorDueno: vi.fn(() => [mockSede]),
    saveOrUpdateSede: vi.fn(),
    sedeOperativaId: signal<number | null>(1),
    setSedeOperativaId: vi.fn(),
  };

  const mockAuthService = {
    currentUser: mockCurrentUser,
    logout: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [AdminConfiguracion],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDbService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminConfiguracion);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    fixture.componentRef.setInput('duenoId', 1);
    fixture.componentRef.setInput('venueId', 1);
    fixture.componentRef.setInput('venue', mockSede);
    fixture.componentRef.setInput('venues', [mockSede]);

    fixture.detectChanges();
  });

  it('debe crearse correctamente e inicializar datos del titular y sede activa', () => {
    expect(component).toBeTruthy();
    expect(component['perfilEmail']()).toBe('dueno@canchero.pe');
    expect(component['titularRazonSocial']()).toBe('Complejo Deportivo Magdalena S.A.C.');
    expect(component['rucFacturacion']()).toBe('20601234567');
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('debe calcular la fortaleza de contraseña correctamente', () => {
    component['pwdNew'].set('');
    expect(component['passwordStrength']().score).toBe(0);
    expect(component['passwordStrength']().label).toBe('Vacía');

    component['pwdNew'].set('12345');
    expect(component['passwordStrength']().score).toBe(1);
    expect(component['passwordStrength']().label).toBe('Débil');

    component['pwdNew'].set('Password123');
    expect(component['passwordStrength']().score).toBe(3);
    expect(component['passwordStrength']().label).toBe('Fuerte');

    component['pwdNew'].set('Password123$#');
    expect(component['passwordStrength']().score).toBe(4);
    expect(component['passwordStrength']().label).toBe('Muy Fuerte');
  });

  it('debe rechazar contraseña menor a 8 caracteres o sin contraseña actual', async () => {
    component['pwdCurrent'].set('');
    component['pwdNew'].set('Abc12345');
    await component.guardarNuevaPassword();
    expect(component['pwdError']()).toContain('contraseña actual');

    component['pwdCurrent'].set('OldPassword123');
    component['pwdNew'].set('short');
    await component.guardarNuevaPassword();
    expect(component['pwdError']()).toContain('al menos 8 caracteres');

    component['pwdNew'].set('OldPassword123');
    await component.guardarNuevaPassword();
    expect(component['pwdError']()).toContain('no puede ser idéntica');
  });

  it('debe actualizar contraseña y emitir aviso si los datos son válidos', async () => {
    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    component['pwdCurrent'].set('OldPassword123');
    component['pwdNew'].set('NewValidPassword2026!');
    component['pwdConfirm'].set('NewValidPassword2026!');
    vi.spyOn(supabase.auth, 'updateUser').mockResolvedValueOnce({ data: { user: null }, error: null } as any);
    await component.guardarNuevaPassword();

    expect(component['pwdError']()).toBe('');
    expect(avisoEmitido).toBeTruthy();
    expect(component['pwdCurrent']()).toBe('');
  });

  it('does not report local success when the authentication session is missing', async () => {
    const notice = vi.fn();
    component.notice.subscribe(notice);
    component['pwdCurrent'].set('OldPassword123');
    component['pwdNew'].set('NewValidPassword2026!');
    component['pwdConfirm'].set('NewValidPassword2026!');
    vi.spyOn(supabase.auth, 'updateUser').mockResolvedValueOnce({ data: { user: null }, error: { message: 'Auth session missing' } } as any);
    await component.guardarNuevaPassword();
    expect(component['pwdSuccess']()).toBe('');
    expect(component['pwdError']()).not.toBe('');
    expect(notice).not.toHaveBeenCalled();
  });

  it('debe alternar visibilidad de contraseña actual y nueva', () => {
    expect(component['showPwdCurrent']()).toBe(false);
    component['toggleShowPwdCurrent']();
    expect(component['showPwdCurrent']()).toBe(true);

    expect(component['showPwdNew']()).toBe(false);
    component['toggleShowPwdNew']();
    expect(component['showPwdNew']()).toBe(true);
  });

  it('debe alternar alertas operativas internas y guardarlas sin simular envíos externos', () => {
    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    expect(component['alertaOperativaActiva']('pagos')).toBe(true);
    component['toggleAlertaOperativa']('pagos');
    expect(component['alertaOperativaActiva']('pagos')).toBe(false);
    expect(avisoEmitido).toContain('Alerta interna');

    const saved = JSON.parse(localStorage.getItem('canchero_pref_alertas') || '{}');
    expect(saved['pagos']).toBe(false);
  });

  it('debe seleccionar cuenta bancaria para liquidaciones y guardarla', () => {
    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    component['seleccionarCuentaBancaria']('interbank');
    expect(component['cuentaBancariaSeleccionada']()).toBe('interbank');
    expect(localStorage.getItem('canchero_payout_bank')).toBe('interbank');
    expect(avisoEmitido).toContain('Interbank');
  });

  it('debe cambiar la frecuencia de pago y guardarla en localStorage', () => {
    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    component['cambiarFrecuenciaPago']('Quincenal');
    expect(component['frecuenciaPago']()).toBe('Quincenal');
    expect(localStorage.getItem('canchero_payout_freq')).toBe('Quincenal');
    expect(avisoEmitido).toContain('Quincenal');
  });

  it('debe permitir agregar una nueva cuenta bancaria a la lista', () => {
    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    component['nuevaCuentaBanco'].set('BanBif');
    component['nuevaCuentaTipo'].set('Cuenta Ahorros');
    component['nuevaCuentaNumero'].set('0011223344556677');
    component['nuevaCuentaCci'].set('011-223-34455667788-99');

    component['guardarNuevaCuentaBancaria']();

    expect(component['cuentasBancarias']().length).toBe(3);
    expect(component['cuentaBancariaSeleccionada']()).toBe('banbif');
    expect(avisoEmitido).toContain('BanBif');
  });

  it('debe emitir selectVenue y addVenue al interactuar con el bloque multisede', () => {
    let sedeSeleccionada: string | number = 0;
    let addVenueLlamado = false;

    component.selectVenue.subscribe((id) => (sedeSeleccionada = id));
    component.addVenue.subscribe(() => (addVenueLlamado = true));

    component['onSelectVenue'](10);
    expect(sedeSeleccionada).toBe(10);

    component['onAddVenue']();
    expect(addVenueLlamado).toBe(true);
  });

  it('debe descargar comprobante de liquidación en formato TXT y XML real sin extensiones falsas', () => {
    const comp = COMPROBANTES_LIQUIDACION_HISTORIAL[0];
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    component['descargarComprobanteTxt'](comp);
    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(avisoEmitido).toContain('formato de texto');

    component['descargarComprobanteXml'](comp);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    expect(avisoEmitido).toContain('XML');

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it('debe abrir modal de confirmación y ejecutar logout al confirmar cierre de sesión', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component['solicitarCierreSesion']();
    expect(component['modalConfirmarLogoutOpen']()).toBe(true);

    await component.confirmarCierreSesion();
    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('debe permitir editar datos del titular y persistirlos en la sede', () => {
    component['abrirEditarPerfil']();
    expect(component['modalEditarPerfilOpen']()).toBe(true);

    component['editNombre'].set('Complejo Real Madrid Lima');
    component['editTelefono'].set('+51 911 222 333');
    component['editRuc'].set('20111222333');

    component['guardarEdicionPerfil']();
    expect(mockDbService.saveOrUpdateSede).toHaveBeenCalled();
    expect(component['modalEditarPerfilOpen']()).toBe(false);
  });
});
