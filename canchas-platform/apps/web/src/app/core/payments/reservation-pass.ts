import * as QRCode from 'qrcode';
import type { PaymentState } from './mercadopago-api';

export function requireActivePass(payment: PaymentState): void {
  if (
    payment.estado !== 'aprobado' ||
    payment.estadoPase !== 'activo' ||
    !/^CAN1_[A-Za-z0-9_-]{43}$/.test(payment.passToken ?? '') ||
    payment.ingresosUtilizados >= payment.cupos
  )
    throw new Error('El pase no está habilitado. Actualiza el estado de la reserva.');
}

export function passUrl(payment: PaymentState, origin: string): string {
  requireActivePass(payment);
  const url = new URL(payment.publicPassUrl || '/accesos', origin);
  if (
    url.pathname !== '/accesos' ||
    url.username ||
    url.password ||
    !['https:', 'http:'].includes(url.protocol)
  )
    throw new Error('El enlace del pase no es válido.');
  url.hash = payment.passToken!;
  return url.href;
}

export function passDate(date: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(`${date}T12:00:00-05:00`));
}

export function passDescription(p: PaymentState): string {
  return `Reserva ${p.codigoReserva || p.reservaId} · ${p.sede}\n${p.cancha}\n${passDate(p.fecha)} · ${p.horario} (hora de Perú)\n${p.direccion || 'Consulta la ubicación en la sede.'}\n${p.cupos} ingresos autorizados en total. Todas las copias del QR comparten este límite.`;
}

// Una imagen A4 mantiene los nombres Unicode y los mismos píxeles del QR en
// PDF y PNG. No utiliza servicios externos ni incorpora secretos de la API.
export async function createPassFiles(
  p: PaymentState,
  origin: string,
): Promise<{ pdf: File; image: File }> {
  const url = passUrl(p, origin);
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, url, { width: 520, margin: 4, errorCorrectionLevel: 'M' });
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo generar el documento en este navegador.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#25832a';
  ctx.fillRect(0, 0, canvas.width, 180);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 46px Arial';
  ctx.fillText('Canchero.MVP', 80, 83);
  ctx.font = '26px Arial';
  ctx.fillText('PASE DE ACCESO · RESERVA CONFIRMADA', 80, 133);
  if (p.testMode) {
    ctx.font = '19px Arial';
    ctx.fillText('Modo prueba · sin cobros reales', 80, 165);
  }
  let y = 237;
  const text = (value: string, font: string, color: string, maxWidth = 1080, lineHeight = 38) => {
    ctx.font = font;
    ctx.fillStyle = color;
    let line = '';
    for (const word of value.split(/\s+/)) {
      // También partir identificadores o nombres sin espacios para evitar desbordes.
      const pieces: string[] = [];
      let piece = '';
      for (const char of word) {
        if (ctx.measureText(piece + char).width > maxWidth) {
          pieces.push(piece);
          piece = '';
        }
        piece += char;
      }
      if (piece) pieces.push(piece);
      for (const part of pieces) {
        const next = line ? `${line} ${part}` : part;
        if (ctx.measureText(next).width > maxWidth && line) {
          ctx.fillText(line, 80, y);
          y += lineHeight;
          line = part;
        } else line = next;
      }
    }
    if (line) {
      ctx.fillText(line, 80, y);
      y += lineHeight;
    }
  };
  text(p.sede, 'bold 36px Arial', '#17212b');
  text(p.cancha, '28px Arial', '#526171');
  y += 12;
  const row = (label: string, value: string) => {
    text(label, 'bold 21px Arial', '#526171', 1080, 30);
    text(value, '28px Arial', '#17212b');
    y += 12;
  };
  row('FECHA', passDate(p.fecha));
  row('HORARIO · HORA DE PERÚ', p.horario);
  row('DIRECCIÓN', p.direccion || 'No registrada. Consulta la ubicación de la sede.');
  row('RESERVA', p.codigoReserva || String(p.reservaId));
  row(
    'IMPORTE PAGADO',
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(p.monto),
  );
  row(
    'INGRESOS AUTORIZADOS',
    `${p.cupos} en total · ${Math.max(0, p.cupos - p.ingresosUtilizados)} disponibles al generar este pase`,
  );
  // Reservar siempre el área inferior para el QR, incluso con textos largos.
  if (y > 1030)
    throw new Error('Los datos son demasiado extensos para el pase. Consulta el pase en pantalla.');
  ctx.drawImage(qr, 360, 1050, 520, 520);
  ctx.textAlign = 'center';
  ctx.font = '24px Arial';
  ctx.fillStyle = '#17212b';
  ctx.fillText('El mismo QR para todos los participantes', 620, 1600);
  ctx.font = '20px Arial';
  ctx.fillStyle = '#526171';
  ctx.fillText(
    'Cada ingreso confirmado consume un cupo. Copiar el QR no aumenta el límite.',
    620,
    1640,
  );
  ctx.fillText(
    'Ingreso desde 15 minutos antes del partido y hasta su hora de finalización.',
    620,
    1674,
  );
  ctx.fillText(
    'El servidor verifica vigencia, pago y cupos en cada lectura. No es comprobante fiscal.',
    620,
    1708,
  );
  const jpeg = await canvasBlob(canvas, 'image/jpeg');
  const png = await canvasBlob(canvas, 'image/png');
  const name = `pase-canchero-${p.reservaId}`;
  return {
    pdf: new File(
      [imagePdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height)],
      `${name}.pdf`,
      { type: 'application/pdf' },
    ),
    image: new File([png], `${name}.png`, { type: 'image/png' }),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('No se pudo generar el archivo del pase.')),
      type,
      0.97,
    ),
  );
}

/** PDF 1.4, una página A4: imagen JPEG íntegra y offsets calculados en bytes. */
export function imagePdf(jpeg: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };
  push('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Pass 4 0 R >> >> /Contents 5 0 R >>',
  );
  offsets[4] = length;
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push('\nendstream\nendobj\n');
  const commands = 'q\n595.28 0 0 841.89 0 0 cm\n/Pass Do\nQ\n';
  object(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref = length;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let id = 1; id <= 5; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const output = new Uint8Array(length);
  let position = 0;
  for (const part of chunks) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

export function downloadPass(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
