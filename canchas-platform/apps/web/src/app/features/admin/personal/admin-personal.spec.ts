import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AdminPersonal } from './admin-personal';
import { AuthService } from '@core/auth/auth.service';
import { StaffAssignment, StaffService } from '@core/services/staff.service';
import { AdminContext } from '../admin-context.service';

const cajero: StaffAssignment = {
  id: 1,
  sedeId: 10,
  sedeNombre: 'Sede Norte',
  usuarioId: 'u-1',
  nombre: 'Ana',
  email: 'ana@canchero.pe',
  rol: 'cajero',
  permisos: ['caja.operar', 'venta.crear'],
};

function setup(isStaff: boolean) {
  const staff = {
    listForVenue: vi.fn(() => of([cajero])),
    assign: vi.fn(() => of({ ...cajero, id: 2, nombre: 'Beto', rol: 'almacen' as const })),
    remove: vi.fn(() => of(undefined)),
  };
  TestBed.configureTestingModule({
    imports: [AdminPersonal],
    providers: [
      { provide: StaffService, useValue: staff },
      { provide: AuthService, useValue: { isVenueStaff: () => isStaff } },
      { provide: AdminContext, useValue: { venue: signal({ id: 10, nombre: 'Sede Norte' }) } },
    ],
  });
  const fixture = TestBed.createComponent(AdminPersonal);
  fixture.detectChanges();
  return { component: fixture.componentInstance, staff };
}

describe('AdminPersonal', () => {
  it('carga el personal de la sede elegida', () => {
    const { component, staff } = setup(false);
    expect(staff.listForVenue).toHaveBeenCalledWith(10);
    expect(component.lista()).toEqual([cajero]);
    expect(component.roles().map((r) => r.value)).toContain('admin');
  });

  it('el personal de sede no puede asignar administradores', () => {
    const { component } = setup(true);
    expect(component.roles().map((r) => r.value)).not.toContain('admin');
  });

  it('asigna por correo y agrega a la lista', () => {
    const { component, staff } = setup(false);
    component.email.set(' beto@canchero.pe ');
    component.rol.set('almacen');
    component.asignar();
    expect(staff.assign).toHaveBeenCalledWith(10, 'beto@canchero.pe', 'almacen');
    expect(component.lista().map((a) => a.nombre)).toEqual(['Ana', 'Beto']);
    expect(component.email()).toBe('');
  });
});
