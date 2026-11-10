import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '@core/auth/auth.service';
import { StaffAssignment, StaffRole, StaffService } from '@core/services/staff.service';
import { AdminContext } from '../admin-context.service';

const ROLES: { value: StaffRole; label: string; desc: string }[] = [
  {
    value: 'admin',
    label: 'Administrador',
    desc: 'Gestiona la sede, su caja, reservas y personal',
  },
  { value: 'cajero', label: 'Cajero', desc: 'Su turno de caja, cobros, reservas y ventas' },
  { value: 'almacen', label: 'Almacén', desc: 'Productos e inventario' },
  { value: 'ayudante', label: 'Ayudante', desc: 'Agenda, pases e incidencias' },
];

@Component({
  standalone: true,
  selector: 'app-admin-personal',
  imports: [FormsModule, MatButtonModule],
  templateUrl: './admin-personal.html',
  styleUrl: './admin-personal.css',
})
export class AdminPersonal {
  protected readonly context = inject(AdminContext);
  private readonly auth = inject(AuthService);
  private readonly staff = inject(StaffService);

  /** Solo el dueño o el superadmin dan o quitan el rol admin (la API lo vuelve a comprobar). */
  readonly puedeGestionarAdmins = computed(() => !this.auth.isVenueStaff());
  readonly roles = computed(() =>
    ROLES.filter((r) => r.value !== 'admin' || this.puedeGestionarAdmins()),
  );

  readonly lista = signal<StaffAssignment[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly email = signal('');
  readonly rol = signal<StaffRole>('cajero');

  constructor() {
    effect((onCleanup) => {
      const sedeId = this.context.venue()?.id;
      if (!sedeId) return;
      this.cargando.set(true);
      this.error.set(null);
      const sub = this.staff.listForVenue(sedeId).subscribe({
        next: (list) => {
          this.lista.set(list);
          this.cargando.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'No se pudo cargar el personal de la sede');
          this.cargando.set(false);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  etiqueta(rol: string): string {
    return ROLES.find((r) => r.value === rol)?.label ?? rol;
  }

  asignar(): void {
    const sedeId = this.context.venue()?.id;
    const email = this.email().trim();
    if (!sedeId || !email || this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    this.staff.assign(sedeId, email, this.rol()).subscribe({
      next: (nuevo) => {
        this.lista.update((list) => [...list.filter((a) => a.id !== nuevo.id), nuevo]);
        this.email.set('');
        this.guardando.set(false);
        this.aviso.set(
          `${nuevo.nombre} ahora es ${this.etiqueta(nuevo.rol)} en ${nuevo.sedeNombre}.`,
        );
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err.error?.message || 'No se pudo asignar a la persona');
      },
    });
  }

  quitar(a: StaffAssignment): void {
    if (!window.confirm(`¿Quitar a ${a.nombre} como ${this.etiqueta(a.rol)}?`)) return;
    this.error.set(null);
    this.aviso.set(null);
    this.staff.remove(a.id).subscribe({
      next: () => this.lista.update((list) => list.filter((x) => x.id !== a.id)),
      error: (err) => this.error.set(err.error?.message || 'No se pudo quitar la asignación'),
    });
  }
}
