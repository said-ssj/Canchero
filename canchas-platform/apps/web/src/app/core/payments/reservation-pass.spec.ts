import { describe, it, expect } from 'vitest';
import { imagePdf, passDescription, passUrl, requireActivePass } from './reservation-pass';
import type { PaymentState } from './mercadopago-api';

const approved = {
  estado: 'aprobado',
  estadoPase: 'activo',
  passToken: `CAN1_${'A'.repeat(43)}`,
  cupos: 4,
  ingresosUtilizados: 1,
  publicPassUrl: `https://canchero.example/accesos#CAN1_${'A'.repeat(43)}`,
  sede: 'Sede Ñandú',
  cancha: 'Cancha Fútbol 7',
  fecha: '2026-11-12',
  horario: '18:00 - 20:00',
  direccion: 'Av. Prueba 100',
  codigoReserva: 'MP-42',
  reservaId: 42,
} as PaymentState;

describe('Documento y QR de reserva', () => {
  it('usa el enlace público canónico incluso al descargar desde localhost y no genera otro token', () => {
    expect(passUrl(approved, 'http://localhost:4200')).toBe(approved.publicPassUrl);
    expect(passUrl({ ...approved, ingresosUtilizados: 2 }, 'https://otra.example')).toBe(
      approved.publicPassUrl,
    );
  });
  it('rechaza pagos pendientes y pases agotados, vencidos o revocados', () => {
    expect(() => requireActivePass({ ...approved, estado: 'pendiente' })).toThrow();
    for (const estadoPase of ['agotado', 'vencido', 'revocado'] as const)
      expect(() => requireActivePass({ ...approved, estadoPase })).toThrow();
    expect(() => requireActivePass({ ...approved, ingresosUtilizados: 4 })).toThrow();
  });
  it('incluye reserva, sede, cancha, dirección, fecha, hora y límite compartido sin correo ni clave del pase', () => {
    const text = passDescription(approved);
    for (const value of [
      'MP-42',
      'Ñandú',
      'Fútbol 7',
      'Av. Prueba 100',
      '12',
      'noviembre',
      '18:00 - 20:00',
      '4 ingresos',
    ])
      expect(text).toContain(value);
    expect(text).not.toContain(approved.passToken!);
  });
  it('genera una página A4 con offsets PDF correctos incluso si el JPEG contiene bytes binarios', () => {
    const bytes = imagePdf(new Uint8Array([255, 216, 0, 128, 255, 217]), 1240, 1754);
    const latin = new TextDecoder('latin1').decode(bytes);
    expect(latin).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(latin).toContain('/Count 1');
    const start = Number(latin.match(/startxref\n(\d+)/)![1]);
    expect(latin.slice(start, start + 4)).toBe('xref');
    const entries = latin.slice(start).split('\n').slice(3, 8);
    entries.forEach((entry, index) =>
      expect(latin.slice(Number(entry.slice(0, 10)))).toMatch(new RegExp(`^${index + 1} 0 obj`)),
    );
  });
});
