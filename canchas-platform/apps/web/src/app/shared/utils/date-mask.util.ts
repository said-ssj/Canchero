/**
 * Formatea una cadena de entrada como máscara numérica DD/MM/YYYY:
 * - Permite únicamente dígitos (0-9)
 * - Inserta automáticamente '/' después del día (DD) y del mes (MM)
 * - Limita la longitud máxima a 10 caracteres (DD/MM/YYYY)
 */
export function formatDateMask(raw: string): string {
  const digits = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Aplica la máscara DD/MM/YYYY sobre un evento (input) de un HTMLInputElement
 * y devuelve la fecha en formato ISO (YYYY-MM-DD) si es una fecha completa válida,
 * o null si aún está incompleta.
 */
export function applyDateMaskToInput(event: Event): {
  masked: string;
  iso: string | null;
  date: Date | null;
} {
  const input = event.target as HTMLInputElement | null;
  if (!input) {
    return { masked: '', iso: null, date: null };
  }
  const masked = formatDateMask(input.value);
  if (input.value !== masked) {
    input.value = masked;
  }
  const iso = parseDdMmYyyyToIso(masked);
  const date = iso ? isoToLocalDate(iso) : null;
  return { masked, iso, date };
}

/**
 * Convierte DD/MM/YYYY a YYYY-MM-DD si tiene 10 caracteres y fecha válida.
 */
export function parseDdMmYyyyToIso(masked: string): string | null {
  const trimmed = String(masked ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const yyyy = String(year);
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convierte YYYY-MM-DD a objeto Date local (sin desfase UTC).
 */
export function isoToLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const trimmed = String(iso).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Convierte un Date local a cadena ISO YYYY-MM-DD.
 */
export function localDateToIso(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
