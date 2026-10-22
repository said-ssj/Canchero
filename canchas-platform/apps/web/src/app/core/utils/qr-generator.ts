import QRCode from 'qrcode';

// Keep the public helpers while using the library for encoding and error correction.
export function generarMatrizQR(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'H' });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) => !!modules.get(row, column)));
}

export function exportarQRSvg(
  matrix: boolean[][],
  size = 240,
  accentColor = '#3CB043',
  _withCenterLogo = false,
): string {
  if (!matrix.length || matrix.some(row => row.length !== matrix.length)) throw new Error('Matriz QR invalida');
  if (!Number.isFinite(size) || size <= 0) throw new Error('Tamano QR invalido');
  if (!/^#[0-9a-f]{6}$/i.test(accentColor)) throw new Error('Color QR invalido');
  const quiet = 4;
  const count = matrix.length + quiet * 2;
  const cell = size / count;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="#ffffff"/>`];
  // Preserve the quiet zone and every encoded module: do not punch a decorative logo into the data.
  for (let row = 0; row < matrix.length; row++) {
    for (let column = 0; column < matrix.length; column++) {
      if (matrix[row][column]) parts.push(`<rect x="${(column + quiet) * cell}" y="${(row + quiet) * cell}" width="${cell}" height="${cell}" fill="#111111"/>`);
    }
  }
  parts.push(`<metadata>Accent ${accentColor}</metadata></svg>`);
  return parts.join('');
}
