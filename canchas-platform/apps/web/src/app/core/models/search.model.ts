export interface SedeResult {
  id: string;
  nombre: string;
  ciudad: string;
  distrito: string;
  direccion?: string;
  foto?: string;
  rating?: number;
  canchasCount?: number;
  precioMin?: number;
}

export interface CanchaResult {
  id: string;
  nombre: string;
  formato: string;
  superficie: string;
  venueId: string;
  venueNombre: string;
  distrito: string;
  precio?: number;
}

export interface PersonaResult {
  id: string;
  nombre: string;
  username: string;
  foto?: string;
  rol?: string;
  isPrivate?: boolean;
}

export interface SearchResults {
  query: string;
  sedes: SedeResult[];
  canchas: CanchaResult[];
  personas: PersonaResult[];
  totalCount: number;
}

/**
 * Normaliza una cadena para búsquedas:
 * - Convierte a minúsculas
 * - Elimina acentos/tildes y diacríticos (ej. "fútbol" -> "futbol", "Perú" -> "peru")
 * - Limpia espacios repetidos
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Divide un texto en partes resaltadas sin usar innerHTML (100% seguro contra XSS).
 */
export function highlightParts(
  text: string | null | undefined,
  query: string | null | undefined,
): Array<{ text: string; isMatch: boolean }> {
  if (!text) return [];
  const q = (query || '').trim();
  if (!q) return [{ text, isMatch: false }];

  const normText = normalizeText(text);
  const normQuery = normalizeText(q);

  const index = normText.indexOf(normQuery);
  if (index === -1) {
    return [{ text, isMatch: false }];
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);

  const parts: Array<{ text: string; isMatch: boolean }> = [];
  if (before) parts.push({ text: before, isMatch: false });
  if (match) parts.push({ text: match, isMatch: true });
  if (after) parts.push({ text: after, isMatch: false });

  return parts;
}
