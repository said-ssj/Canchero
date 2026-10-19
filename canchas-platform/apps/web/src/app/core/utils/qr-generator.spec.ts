import { describe, it, expect } from 'vitest';
import { generarMatrizQR, exportarQRSvg } from './qr-generator';
import jsQR from 'jsqr';

describe('QR Generator Utility (ISO/IEC 18004 Standard)', () => {
  it('genera una matriz cuadrada con finders válidos en las esquinas', () => {
    const matrix = generarMatrizQR('https://canchero.pe/sedes/1');
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix[0].length).toBe(matrix.length);

    // Los finders en (0,0), (0, end-7), (end-7, 0) deben tener el centro 3x3 activo
    expect(matrix[3][3]).toBe(true);
    expect(matrix[3][matrix.length - 4]).toBe(true);
    expect(matrix[matrix.length - 4][3]).toBe(true);
  });

  it('exporta un archivo SVG válido con dimensiones y acento cromático', () => {
    const matrix = generarMatrizQR('https://canchero.pe/sedes/2');
    const svg = exportarQRSvg(matrix, 200, '#F5821F', true);

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 200 200"');
    expect(svg).toContain('<metadata>Accent #F5821F</metadata>');
    expect(svg).not.toContain('<circle');
    expect(svg).toContain('</svg>');
  });

  it.each([
    'https://canchero.pe/sedes/2',
    'https://canchero.pe/sedes/123?nombre=' + encodeURIComponent('Cancha del barrio - Torneo de verano '.repeat(8)),
  ])('can be decoded without losing any part of the target URL', text => {
    const matrix = generarMatrizQR(text);
    const scale = 4;
    const size = (matrix.length + 8) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < matrix.length; row++) {
      for (let col = 0; col < matrix.length; col++) {
        if (!matrix[row][col]) continue;
        for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
          const index = (((row + 4) * scale + y) * size + (col + 4) * scale + x) * 4;
          pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
        }
      }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(text);
  });
});
