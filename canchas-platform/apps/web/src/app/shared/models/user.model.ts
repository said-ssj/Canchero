export type UserRole = 'PLAYER' | 'OWNER' | 'dueno' | 'cliente' | 'operador' | 'admin' | 'caja';

export interface User {
  id: string;
  id_usuario?: string;
  nombre: string;
  apellido?: string;
  correo?: string;
  email: string;
  rol: UserRole;
  id_rol?: number;
  telefono?: string;
  password?: string;
  password_hash?: string;
  estado?: string;
}