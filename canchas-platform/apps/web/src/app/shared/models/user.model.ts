export type UserRole = 'PLAYER' | 'OWNER' | 'dueno' | 'cliente' | 'operador' | 'admin' | 'caja';

export interface User {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  telefono?: string;
  password?: string;
}