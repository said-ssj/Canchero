import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type { UserRole } from '@shared/models/user.model';

export interface AdminUserItem {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  rol: UserRole | string;
  estado: string;
}

export interface UpdateRolePayload {
  rol: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listAllUsers(): Observable<AdminUserItem[]> {
    return this.http.get<AdminUserItem[]>(`${this.apiUrl}/users`);
  }

  updateUserRole(userId: string, role: string): Observable<AdminUserItem> {
    return this.http.patch<AdminUserItem>(`${this.apiUrl}/users/${userId}/role`, { rol: role });
  }
}
