import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { PaymentResult, RESERVATION_PASS_EXPORT } from './payment-result';
import { AuthService } from '../../../core/auth/auth.service';
import { MercadoPagoApi } from '../../../core/payments/mercadopago-api';
import type { PaymentState } from '../../../core/payments/mercadopago-api';

describe('Retorno verificado de Mercado Pago', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const api = { state: vi.fn(), refresh: vi.fn(), byBooking: vi.fn() };
  const passFiles = { create: vi.fn(), download: vi.fn() };
  let params: Record<string, string>;
  const held = () => ({
    id,
    courtId: '895',
    estado: 'pendiente',
    canResume: true,
    paymentStatus: null,
    passToken: null,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    params = { checkout: id };
    TestBed.configureTestingModule({
      imports: [PaymentResult],
      providers: [
        provideRouter([]),
        { provide: RESERVATION_PASS_EXPORT, useValue: passFiles },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(params);
              },
            },
          },
        },
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => true, ready: new Promise(() => {}) },
        },
        { provide: MercadoPagoApi, useValue: api },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  it('volver sin pagar recupera Convocados desde la retención autorizada', async () => {
    api.state.mockResolvedValue(held());
    const fixture = TestBed.createComponent(PaymentResult);
    await fixture.componentInstance.load(true);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/checkout'], {
      queryParams: { courtId: '895', resume: id },
      replaceUrl: true,
    });
    expect(api.refresh).not.toHaveBeenCalled();
    fixture.destroy();
  });
  it('un pago realmente pendiente no se redirige ni se presenta como validación del dueño', async () => {
    params['payment_id'] = '9876';
    api.refresh.mockResolvedValue({ ...held(), canResume: false, paymentStatus: 'pending' });
    const fixture = TestBed.createComponent(PaymentResult);
    await fixture.componentInstance.load(true);
    expect(api.refresh).toHaveBeenCalledWith(id, '9876');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.title()).toBe('Pago en proceso');
    fixture.destroy();
  });
  it('status=approved en la URL no acredita nada y collection_id se verifica con la API', async () => {
    params['collection_id'] = '4567';
    params['status'] = 'approved';
    api.refresh.mockResolvedValue({ ...held(), paymentStatus: 'rejected' });
    const fixture = TestBed.createComponent(PaymentResult);
    await fixture.componentInstance.load(true);
    expect(api.refresh).toHaveBeenCalledWith(id, '4567');
    expect(fixture.componentInstance.data()?.passToken).toBeNull();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    fixture.destroy();
  });
  it('una retención vencida conserva su resultado y no se recupera como reserva activa', async () => {
    api.state.mockResolvedValue({ ...held(), estado: 'expirado', canResume: false });
    const fixture = TestBed.createComponent(PaymentResult);
    await fixture.componentInstance.load();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.title()).toBe('Reserva temporal vencida');
    fixture.destroy();
  });
  it('vuelve a verificar el pase antes de exportar y bloquea uno revocado después de mostrarlo', async () => {
    const fixture = TestBed.createComponent(PaymentResult);
    fixture.componentInstance.data.set({
      ...held(),
      estado: 'aprobado',
      estadoPase: 'activo',
    } as PaymentState);
    api.state.mockResolvedValue({ ...held(), estado: 'reembolsado', estadoPase: 'revocado' });
    await fixture.componentInstance.exportPass('pdf');
    expect(api.state).toHaveBeenCalledWith(id);
    expect(passFiles.create).not.toHaveBeenCalled();
    expect(passFiles.download).not.toHaveBeenCalled();
    expect(fixture.componentInstance.exportMessage()).toContain('no está habilitado');
    fixture.destroy();
  });
  it('descarga el PDF de la misma reserva con el mismo token verificado', async () => {
    const verified = {
      ...held(),
      estado: 'aprobado',
      estadoPase: 'activo',
      cupos: 4,
      ingresosUtilizados: 1,
      passToken: `CAN1_${'A'.repeat(43)}`,
    } as PaymentState;
    const file = new File(['documento de prueba'], 'pase.pdf', { type: 'application/pdf' });
    api.state.mockResolvedValue(verified);
    passFiles.create.mockResolvedValue({ pdf: file, image: new File([], 'pase.png') });
    const fixture = TestBed.createComponent(PaymentResult);
    fixture.componentInstance.data.set(verified);
    await fixture.componentInstance.exportPass('pdf');
    expect(passFiles.create).toHaveBeenCalledWith(verified, window.location.origin);
    expect(passFiles.download).toHaveBeenCalledWith(file);
    fixture.destroy();
  });
});
