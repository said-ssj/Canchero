export interface ColorPaletteItem {
  hex: string;
  nombre: string;
  label: string;
}

export type MetodoQr = 'yape' | 'plin';

export interface PersonalizacionFormState {
  colorAcento: string;
  colorAcentoNombre: string;
  tagline: string;
  historia: string;
  merchantName: string;
  phoneNumber: string;
  qrMetodo: MetodoQr;
  logoUrl?: string;
  portadaUrl?: string;
}

export const PALETA_COLORES_CANCHERO: ColorPaletteItem[] = [
  { hex: '#3CB043', nombre: 'Verde Césped Oficial', label: 'Césped Pro' },
  { hex: '#2E7D32', nombre: 'Verde Bosque Nocturno', label: 'Verde Bosque' },
  { hex: '#F5821F', nombre: 'Naranja Canchero', label: 'Naranja Match' },
  { hex: '#E65100', nombre: 'Naranja Ámbar Intenso', label: 'Ámbar Intenso' },
  { hex: '#1976D2', nombre: 'Azul Confianza', label: 'Azul Premium' },
  { hex: '#7B1FA2', nombre: 'Morado Torneo', label: 'Morado Torneo' },
  { hex: '#C62828', nombre: 'Rojo Energía', label: 'Rojo Pasión' },
  { hex: '#00897B', nombre: 'Verde Azulado', label: 'Teal Moderno' },
  { hex: '#1A1A1A', nombre: 'Negro Carbón Élite', label: 'Negro Élite' },
];
