export type UserRole = 'PLAYER' | 'OWNER';

export interface User {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  telefono?: string;
  password?: string;
}