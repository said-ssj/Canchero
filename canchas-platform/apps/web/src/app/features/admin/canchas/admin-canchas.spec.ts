import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { DatabaseService } from '@core/supabase/database.service';
import { AdminCanchas } from './admin-canchas';
import type { AdminCourt } from './admin-canchas.models';

describe('AdminCanchas', () => {
  let fixture: ComponentFixture<AdminCanchas>;
  let component: AdminCanchas;
  const venues = [{ id: 10, nombre: 'Sede A' }, { id: 20, nombre: 'Sede B' }];
  const courts = signal<AdminCourt[]>([]);
  const catalogLoading = signal(false);
  const loadErrors = signal<string[]>([]);
  const bloqueos = signal<any[]>([]);
  const reservas = signal<any[]>([]);
  const usuarios = signal<any[]>([]);
  const createCancha = vi.fn();
  const updateCancha = vi.fn();
  const refreshCatalogo = vi.fn();
  const toggleCanchaActiva = vi.fn();
  const createBloqueo = vi.fn();
  const reabrirBloqueo = vi.fn();
  const reprogramarReserva = vi.fn();
  const descartarReserva = vi.fn();
  const uploadPublicImage = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    courts.set([
      {
        id: 1,
        sede_id: 10,
        nombre: 'Cancha A',
        precio_hora: 80,
        precio_hora_noche: 100,
        hora_inicio_noche: '18:00',
        activa: true,
        usar_horario_sede: true,
      },
      {
        id: 2,
        sede_id: 20,
        nombre: 'Cancha B',
        precio_hora: 90,
        precio_hora_noche: 110,
        hora_inicio_noche: '19:00',
        activa: false,
        usar_horario_sede: false,
      },
    ]);
    catalogLoading.set(false);
    loadErrors.set([]);
    bloqueos.set([]);
    reservas.set([]);
    usuarios.set([
      { id: 101, id_usuario: 'u-101', nombre: 'Carlos Santana', telefono: '987654321' },
    ]);

    await TestBed.configureTestingModule({
      imports: [AdminCanchas],
      providers: [
        {
          provide: DatabaseService,
          useValue: {
            catalogLoading,
            loadErrors,
            createCancha,
            updateCancha,
            refreshCatalogo,
            toggleCanchaActiva,
            createBloqueo,
            reabrirBloqueo,
            reprogramarReserva,
            descartarReserva,
            uploadPublicImage,
            bloqueos,
            reservas,
            usuarios,
            getCanchasPorSede: (id: number) => courts().filter((court) => court.sede_id === id),
            canchaById: (id: number) => courts().find((court) => court.id === id),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCanchas);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('duenoId', 'owner-a');
    fixture.componentRef.setInput('sedesDelDueno', venues);
    fixture.componentRef.setInput('sedeDelDueno', venues[0]);
    fixture.detectChanges();
  });

  it('renders only the selected venue and reacts to venue changes', () => {
    expect(component['canchasDelDueno']().map((c) => c.id)).toEqual([1]);
    component['editarCancha'](courts()[0]);
    fixture.componentRef.setInput('sedeDelDueno', venues[1]);
    fixture.detectChanges();
    expect(component['canchasDelDueno']().map((c) => c.id)).toEqual([2]);
    expect(component['formularioCanchaAbierto']()).toBe(false);
  });

  it('rejects a selected venue outside the owner list', () => {
    fixture.componentRef.setInput('sedesDelDueno', [venues[0]]);
    fixture.componentRef.setInput('sedeDelDueno', venues[1]);
    fixture.detectChanges();
    expect(component['canchasDelDueno']()).toEqual([]);
    component['toggleOperativaCancha'](2);
    expect(toggleCanchaActiva).not.toHaveBeenCalled();
  });

  it('waits for maintenance confirmation, prevents double clicks and updates the card metrics', async () => {
    let finish!: (court: AdminCourt) => void;
    toggleCanchaActiva.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const notice = vi.fn();
    component.notice.subscribe(notice);
    const pending = component['toggleOperativaCancha'](1);
    await component['toggleOperativaCancha'](1);
    expect(toggleCanchaActiva).toHaveBeenCalledOnce();
    expect(component['cambiandoOperatividad']()).toBe(true);
    expect(notice).not.toHaveBeenCalled();
    const saved = { ...courts()[0], activa: false };
    courts.set([saved, courts()[1]]);
    finish(saved);
    await pending;
    fixture.detectChanges();
    expect(component['activasCount']()).toBe(0);
    expect(component['mantenimientoCount']()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Habilitar');
    expect(notice).toHaveBeenCalledOnce();
  });

  it('does not announce success when maintenance fails', async () => {
    toggleCanchaActiva.mockRejectedValue(new Error('offline'));
    const notice = vi.fn();
    component.notice.subscribe(notice);
    await component['toggleOperativaCancha'](1);
    fixture.detectChanges();
    expect(component['activasCount']()).toBe(1);
    expect(component['cambiandoOperatividad']()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('estado anterior');
    expect(notice).not.toHaveBeenCalled();
  });

  it('does not discard an edit when the same venue refreshes', () => {
    component['editarCancha'](courts()[0]);
    component['nuevaCanchaNombre'].set('Borrador');
    fixture.componentRef.setInput('sedeDelDueno', { ...venues[0] });
    fixture.detectChanges();
    expect(component['formularioCanchaAbierto']()).toBe(true);
    expect(component['nuevaCanchaNombre']()).toBe('Borrador');
  });

  it('distinguishes loading, error and an empty catalog', () => {
    courts.set([]);
    catalogLoading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Cargando canchas"]')).not.toBeNull();
    catalogLoading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Cargando canchas"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-admin-add-action')).not.toBeNull();
    loadErrors.set(['cancha']);
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Error al cargar canchas');
    alert.querySelector('button').click();
    expect(refreshCatalogo).toHaveBeenCalledOnce();
  });

  it('delegates first venue registration and hours without a second router', () => {
    const register = vi.fn();
    const hours = vi.fn();
    component.registerVenue.subscribe(register);
    component.hoursRequested.subscribe(hours);
    fixture.componentRef.setInput('sedesDelDueno', []);
    fixture.detectChanges();
    component['abrirFormularioNuevaCancha']();
    component['abrirDrawerHorarios']();
    expect(register).toHaveBeenCalledOnce();
    expect(hours).toHaveBeenCalledOnce();
    expect(component['formularioCanchaAbierto']()).toBe(false);
  });

  it('preserves tariffs, attributes and the selected cover when editing', () => {
    component['editarCancha'](courts()[0]);
    component['nuevaCanchaTarifa'].set(120);
    component['nuevaCanchaTarifaNoc'].set(150);
    component['nuevaCanchaHoraInicioNoche'].set('19:00');
    component['seleccionarFotoPrincipal']('test-cover.jpg');
    component['guardarNuevaCancha']();
    expect(updateCancha).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        sede_id: 10,
        precio_hora: 120,
        precio_hora_noche: 150,
        hora_inicio_noche: '19:00',
        foto_url: 'test-cover.jpg',
      }),
    );
    expect(createCancha).not.toHaveBeenCalled();
  });

  it('matches a persisted short format to its selector option instead of selecting Futbol 5', () => {
    const court = { ...courts()[0], tipo: 'Fútbol 7' };
    courts.set([court]);
    component['editarCancha'](court);
    expect(component['nuevaCanchaFormato']()).toBe('Fútbol 7 (14 jugadores)');
    fixture.detectChanges();
    const selects = fixture.nativeElement.querySelectorAll('.management-editor select') as NodeListOf<HTMLSelectElement>;
    expect(selects[1].value).toBe('Fútbol 7 (14 jugadores)');
    expect(selects[3].value).toBe(component['nuevaCanchaCobertura']());
  });

  it('disables unsupported individual schedule saves instead of simulating persistence', () => {
    component['abrirGestionCancha'](courts()[0]);
    fixture.detectChanges();
    const save = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Guardar horarios'));
    expect(save?.disabled).toBe(true);
    save?.click();
    expect(updateCancha).not.toHaveBeenCalled();
  });

  it('creates in the chosen owned venue and notifies the parent selection', () => {
    const select = vi.fn();
    component.venueSelected.subscribe(select);
    component['abrirFormularioNuevaCancha']();
    component['nuevaCanchaNombre'].set('Nueva cancha');
    component['nuevaCanchaSedeId'].set(20);
    component['nuevaCanchaHoraInicioNoche'].set('20:00');
    component['guardarNuevaCancha']();
    expect(createCancha).toHaveBeenCalledWith(
      expect.objectContaining({
        sede_id: 20,
        creado_por: 'owner-a',
        hora_inicio_noche: '20:00',
      }),
    );
    expect(select).toHaveBeenCalledWith(20);
  });

  it('retains form data after a synchronous service error', () => {
    component['editarCancha'](courts()[0]);
    updateCancha.mockImplementation(() => {
      throw new Error('unavailable');
    });
    component['guardarNuevaCancha']();
    expect(component['formularioCanchaAbierto']()).toBe(true);
    expect(component['nuevaCanchaNombre']()).toBe('Cancha A');
  });

  it('does not save an empty name or a foreign venue', () => {
    component['abrirFormularioNuevaCancha']();
    component['guardarNuevaCancha']();
    component['nuevaCanchaNombre'].set('Nombre');
    component['nuevaCanchaSedeId'].set(999);
    component['guardarNuevaCancha']();
    expect(createCancha).not.toHaveBeenCalled();
  });

  it('only the upload button opens the file chooser, not the grey area', () => {
    component['abrirFormularioNuevaCancha']();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="file"]');
    const click = vi.spyOn(input, 'click');
    fixture.nativeElement.querySelector('.cancha-photo-dropzone').click();
    expect(click).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.cancha-photo-dropzone button').click();
    expect(click).toHaveBeenCalledOnce();
  });

  /* ================= PRUEBAS ETAPA 3: HORARIOS, DESCANSOS, CIERRES Y AFECTADAS ================= */

  it('allows opening court hours management and toggling between venue schedule and individual schedule', () => {
    component['abrirGestionCancha'](courts()[0]);
    expect(component['panelGestionAbierto']()).toBe(true);
    expect(component['canchaGestion']()?.id).toBe(1);
    expect(component['horarioModo']()).toBe('comun');

    component['cambiarModoHorario']('individual');
    expect(component['horarioModo']()).toBe('individual');
    component['actualizarHorarioIndividual'](1, 'apertura', '08:00');
    component['guardarHorariosCancha']();

    expect(updateCancha).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        usar_horario_sede: false,
        horarios_semana: expect.arrayContaining([
          expect.objectContaining({ diaSemana: 1, apertura: '08:00' }),
        ]),
      }),
    );
  });

  it('configures recurring breaks supporting overnight intervals and toggling', () => {
    component['abrirGestionCancha'](courts()[0], 'descansos');
    component['nuevoDescansoNombre'].set('Limpieza profunda');
    component['nuevoDescansoDias'].set([1, 3, 5]);
    component['nuevoDescansoHoraInicio'].set('23:00');
    component['nuevoDescansoHoraFin'].set('02:00'); // Overnight

    component['agregarDescansoRecurrente']();
    expect(component['descansosCancha']().length).toBe(1);
    expect(component['descansosCancha']()[0]).toEqual(
      expect.objectContaining({
        nombre: 'Limpieza profunda',
        dias: [1, 3, 5],
        hora_inicio: '23:00',
        hora_fin: '02:00',
        activo: true,
      }),
    );

    // Toggle active state
    const id = component['descansosCancha']()[0].id;
    component['toggleEstadoDescanso'](id);
    expect(component['descansosCancha']()[0].activo).toBe(false);

    // Remove break
    component['eliminarDescanso'](id);
    expect(component['descansosCancha']().length).toBe(0);
  });

  it('registers immediate and scheduled closures and notifies parent', () => {
    component['abrirGestionCancha'](courts()[0], 'cierres');
    component['abrirFormularioCierre']();
    component['nuevoCierreAlcance'].set('cancha');
    component['nuevoCierreTipo'].set('inmediato');
    component['nuevoCierreMotivo'].set('Lluvia intensa y anegamiento');

    component['aplicarCierre']();
    expect(createBloqueo).toHaveBeenCalledWith(
      expect.objectContaining({
        cancha_id: 1,
        sede_id: 10,
        alcance: 'cancha',
        tipo: 'inmediato',
        motivo: 'Lluvia intensa y anegamiento',
      }),
    );
    expect(component['mostrarFormularioNuevoCierre']()).toBe(false);
  });

  it('detects affected reservations during closure periods without automatically cancelling them', () => {
    const hoyStr = new Date().toISOString().split('T')[0];
    reservas.set([
      {
        id: 501,
        cancha_id: 1,
        usuario_id: 101,
        fecha: hoyStr,
        hora_inicio: '18:00',
        hora_fin: '19:00',
        monto_total: 100,
        estado: 'confirmada',
        codigo_pase: '#CAN-501',
      },
    ]);
    bloqueos.set([
      {
        id: 99,
        cancha_id: 1,
        sede_id: 10,
        alcance: 'cancha',
        tipo: 'inmediato',
        motivo: 'Mantenimiento de luminarias',
        fecha_inicio: `${hoyStr}T00:00:00`,
        activo: true,
      },
    ]);

    component['abrirGestionCancha'](courts()[0], 'cierres');
    const afectadas = component['reservasAfectadasPorCierres']();

    expect(afectadas.length).toBe(1);
    expect(afectadas[0].codigoPase).toBe('#CAN-501');
    expect(afectadas[0].jugadorNombre).toBe('Carlos Santana');
    // Business rule 5: Reservation is NOT cancelled or refunded automatically
    expect(descartarReserva).not.toHaveBeenCalled();
  });

  it('allows rescheduling an affected reservation without altering payments', () => {
    const affectedRes = {
      reservaId: 501,
      codigoPase: '#CAN-501',
      canchaId: 1,
      canchaNombre: 'Cancha A',
      jugadorNombre: 'Carlos Santana',
      telefono: '987654321',
      fecha: '2026-10-15',
      horario: '18:00 - 19:00',
      monto: 100,
      estado: 'confirmada',
    };

    component['abrirModalReprogramar'](affectedRes);
    expect(component['reservaEnReprogramacion']()).not.toBeNull();

    component['reprogramarFecha'].set('2026-10-16');
    component['reprogramarHoraInicio'].set('20:00');
    component['reprogramarHoraFin'].set('21:00');
    component['confirmarReprogramacion']();

    expect(reprogramarReserva).toHaveBeenCalledWith(501, '2026-10-16', '20:00 - 21:00');
    expect(component['reservaEnReprogramacion']()).toBeNull();
  });
});
