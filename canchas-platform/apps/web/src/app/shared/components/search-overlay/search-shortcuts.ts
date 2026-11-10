export interface SearchShortcut {
  id: string;
  label: string;
  icon: string;
  route: string;
  queryParams?: Record<string, string>;
  action?: 'filter' | 'persons_mode';
}

export const SEARCH_SHORTCUTS: SearchShortcut[] = [
  {
    id: 'f7',
    label: 'Canchas de Fútbol 7',
    icon: 'sports_soccer',
    route: '/sedes',
    queryParams: { formato: 'f7' },
    action: 'filter',
  },
  {
    id: 'f5',
    label: 'Canchas de Fútbol 5',
    icon: 'sports_soccer',
    route: '/sedes',
    queryParams: { formato: 'f5' },
    action: 'filter',
  },
  {
    id: 'sintetico',
    label: 'Césped sintético',
    icon: 'stadium',
    route: '/sedes',
    queryParams: { superficie: 'sintetico' },
    action: 'filter',
  },
  {
    id: 'lima',
    label: 'Sedes en Lima Metropolitana',
    icon: 'location_on',
    route: '/sedes',
    queryParams: { ciudad: 'lima' },
    action: 'filter',
  },
  {
    id: 'personas',
    label: 'Comunidad y otros usuarios',
    icon: 'group',
    route: '/perfil',
    action: 'persons_mode',
  },
];
