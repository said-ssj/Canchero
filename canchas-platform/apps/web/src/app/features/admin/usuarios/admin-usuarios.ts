import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { AuthService } from '@core/auth/auth.service';
import { UserService, AdminUserItem } from '@core/services/user.service';

@Component({
  standalone: true,
  selector: 'app-admin-usuarios',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatPaginatorModule,
  ],
  templateUrl: './admin-usuarios.html',
  styleUrl: './admin-usuarios.css',
})
export class AdminUsuarios implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);

  readonly isSuperAdmin = computed(() => this.auth.isSuperAdmin());
  readonly currentUserId = computed(() => this.auth.currentUser()?.id);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly updatingId = signal<string | null>(null);

  readonly users = signal<AdminUserItem[]>([]);
  readonly searchFilter = signal('');
  readonly roleFilter = signal('TODOS');

  readonly filteredUsers = computed(() => {
    const list = this.users();
    const query = this.searchFilter().trim().toLowerCase();
    const role = this.roleFilter().trim().toLowerCase();

    return list.filter((u) => {
      const matchQuery =
        !query ||
        u.nombre.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        (u.telefono && u.telefono.toLowerCase().includes(query));

      const matchRole = role === 'todos' || u.rol.toLowerCase() === role;

      return matchQuery && matchRole;
    });
  });

  readonly displayedColumnsUsers = ['usuario', 'contacto', 'rol', 'estado', 'acciones'];
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly paginatedUsers = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filteredUsers().slice(start, start + this.pageSize());
  });

  onUsersPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  readonly stats = computed(() => {
    const all = this.users();
    return {
      total: all.length,
      admins: all.filter((u) => u.rol.toLowerCase() === 'admin').length,
      superadmins: all.filter((u) => u.rol.toLowerCase() === 'superadmin').length,
      duenos: all.filter((u) => u.rol.toLowerCase() === 'dueno').length,
      clientes: all.filter((u) => u.rol.toLowerCase() === 'cliente').length,
    };
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    if (!this.isSuperAdmin()) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.userService.listAllUsers().subscribe({
      next: (data) => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          err.error?.message || 'Error al cargar el listado de usuarios de la plataforma',
        );
        this.loading.set(false);
      },
    });
  }

  toggleAdminRole(user: AdminUserItem): void {
    if (user.id === this.currentUserId() || user.rol.toLowerCase() === 'superadmin') {
      return;
    }

    const currentRol = user.rol.toLowerCase();
    const newRol = currentRol === 'admin' ? 'cliente' : 'admin';
    const actionText =
      newRol === 'admin' ? 'otorgar rol de Administrador a' : 'quitar rol de Administrador de';

    const confirmed = window.confirm(`¿Estás seguro de ${actionText} ${user.nombre}?`);
    if (!confirmed) return;

    this.updatingId.set(user.id);
    this.error.set(null);
    this.successMessage.set(null);

    this.userService.updateUserRole(user.id, newRol).subscribe({
      next: (updatedUser) => {
        this.users.update((current) =>
          current.map((u) => (u.id === updatedUser.id ? { ...u, rol: updatedUser.rol } : u)),
        );
        this.updatingId.set(null);
        this.successMessage.set(
          `Rol actualizado con éxito para ${updatedUser.nombre}: ahora es ${updatedUser.rol.toUpperCase()}.`,
        );
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.updatingId.set(null);
        this.error.set(err.error?.message || 'No se pudo actualizar el rol del usuario.');
      },
    });
  }
}
