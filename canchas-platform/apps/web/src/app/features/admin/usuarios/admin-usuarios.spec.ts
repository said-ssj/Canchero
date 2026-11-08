import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminUsuarios } from './admin-usuarios';
import { AuthService } from '@core/auth/auth.service';
import { UserService } from '@core/services/user.service';

describe('AdminUsuarios Component', () => {
  let component: AdminUsuarios;
  let fixture: ComponentFixture<AdminUsuarios>;

  const mockUsers = [
    {
      id: 'u-1',
      nombre: 'Super User',
      email: 'super@canchero.pe',
      telefono: '999111222',
      rol: 'superadmin',
      estado: 'A',
    },
    {
      id: 'u-2',
      nombre: 'Admin User',
      email: 'admin@canchero.pe',
      telefono: '999333444',
      rol: 'admin',
      estado: 'A',
    },
    {
      id: 'u-3',
      nombre: 'Player User',
      email: 'player@canchero.pe',
      telefono: '999555666',
      rol: 'cliente',
      estado: 'A',
    },
  ];

  const mockUserService = {
    listAllUsers: vi.fn(() => of(mockUsers)),
    updateUserRole: vi.fn((id: string, rol: string) =>
      of({
        id,
        nombre: 'Updated User',
        email: 'test@canchero.pe',
        telefono: '999',
        rol,
        estado: 'A',
      }),
    ),
  };

  const mockAuthService = {
    isSuperAdmin: vi.fn(() => true),
    currentUser: vi.fn(() => ({ id: 'u-1', rol: 'superadmin' })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminUsuarios],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUsuarios);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe crearse y listar usuarios si el usuario es superadmin', () => {
    expect(component).toBeTruthy();
    expect(mockUserService.listAllUsers).toHaveBeenCalled();
    expect(component.users().length).toBe(3);
    expect(component.stats().total).toBe(3);
    expect(component.stats().admins).toBe(1);
    expect(component.stats().superadmins).toBe(1);
  });

  it('debe filtrar usuarios por búsqueda de texto y por rol', () => {
    component.searchFilter.set('Player');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].nombre).toBe('Player User');

    component.searchFilter.set('');
    component.roleFilter.set('admin');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].rol).toBe('admin');
  });

  it('debe permitir cambiar a cualquier rol excepto superadmin', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const playerUser = mockUsers[2];
    component.cambiarRol(playerUser, 'cajero');
    expect(mockUserService.updateUserRole).toHaveBeenCalledWith('u-3', 'cajero');

    mockUserService.updateUserRole.mockClear();
    component.cambiarRol(mockUsers[0], 'cliente');
    expect(mockUserService.updateUserRole).not.toHaveBeenCalled();
  });
});
