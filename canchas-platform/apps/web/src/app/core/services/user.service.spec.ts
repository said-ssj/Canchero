import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UserService } from './user.service';
import { environment } from '@env/environment';

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UserService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('debe listar todos los usuarios via GET /api/users', () => {
    service.listAllUsers().subscribe((users) => {
      expect(users.length).toBe(2);
      expect(users[0].nombre).toBe('Admin Test');
    });

    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'u-1',
        nombre: 'Admin Test',
        email: 'admin@canchero.pe',
        telefono: '999111222',
        rol: 'admin',
        estado: 'A',
      },
      {
        id: 'u-2',
        nombre: 'Player Test',
        email: 'player@canchero.pe',
        telefono: '999333444',
        rol: 'cliente',
        estado: 'A',
      },
    ]);
  });

  it('debe actualizar el rol de un usuario via PATCH /api/users/:id/role', () => {
    service.updateUserRole('u-2', 'admin').subscribe((user) => {
      expect(user.rol).toBe('admin');
    });

    const req = http.expectOne(`${environment.apiUrl}/users/u-2/role`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ rol: 'admin' });
    req.flush({
      id: 'u-2',
      nombre: 'Player Test',
      email: 'player@canchero.pe',
      telefono: '999333444',
      rol: 'admin',
      estado: 'A',
    });
  });
});
