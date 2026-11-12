import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CommunityProfilePage } from './community-profile';
import {
  CommunityProfileService,
  CommunityProfile,
} from '@core/services/community-profile.service';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { ChatService } from '@core/services/chat.service';

describe('Perfil personal de dueño con varias sedes', () => {
  const data: CommunityProfile = {
    id: 'owner-a',
    name: 'Persona Apellido',
    photo: 'https://example.test/owner.jpg',
    role: 'Dueño',
    biography: 'Mi biografía',
    whatsapp: '',
    cover: null,
    followers: 0,
    following: 0,
    postCount: 0,
    venues: [
      { id: '10', name: 'Complejo Uno', photo: 'https://example.test/venue.jpg' },
      { id: '20', name: 'Complejo Dos' },
    ],
    reviewCount: 4,
    rating: 4,
    reviews: [],
  };
  async function setup() {
    const api = {
      profile: vi.fn(() => of(data)),
      posts: vi.fn(() => of({ items: [], hasMore: false })),
      publish: vi.fn(),
      relationship: vi.fn(() => of({ following: false })),
      follow: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [CommunityProfilePage],
      providers: [
        provideRouter([]),
        { provide: CommunityProfileService, useValue: api },
        {
          provide: ChatService,
          useValue: { relationship: () => of({ blockedByMe: false }), block: () => of(undefined) },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'owner-a' }),
            isLoggedIn: signal(true),
            playerProfile: signal(null),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            catalogLoading: signal(false),
            catalogError: signal(false),
            getVenueDetalle: () => ({ canchas: [] }),
            getSedesPorDueno: () => [],
            sedes: signal([]),
            getReservasPorJugador: () => [],
          },
        },
      ],
    });
    const f = TestBed.createComponent(CommunityProfilePage);
    f.componentRef.setInput('userId', 'owner-a');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return { f, api, c: f.componentInstance, element: f.nativeElement as HTMLElement };
  }
  it('usa nombre y foto de la persona, nunca la fotografía de una sede como avatar', async () => {
    const { element } = await setup();
    expect(element.querySelector('h1')?.textContent).toContain('Persona Apellido');
    expect(element.querySelector('.profile-avatar img')?.getAttribute('src')).toBe(
      'https://example.test/owner.jpg',
    );
    expect(element.querySelector('.profile-avatar img')?.getAttribute('src')).not.toContain(
      'venue.jpg',
    );
    expect(element.textContent).toContain('2 sedes');
  });
  it('reúne todas las sedes en el mismo perfil y muestra el promedio general', async () => {
    const { f, c, element } = await setup();
    c['tab'].set('sedes');
    f.detectChanges();
    expect(element.textContent).toContain('Complejo Uno');
    expect(element.textContent).toContain('Complejo Dos');
    expect(element.textContent).toContain('4 opiniones');
    expect(
      [...element.querySelectorAll('.venue-card a')].map((a) => a.getAttribute('href')),
    ).toEqual(['/sedes/10', '/sedes/20']);
  });
  it('conserva texto y fotos ante un fallo al publicar y no anuncia una publicación guardada', async () => {
    const { c, api } = await setup();
    c['text'] = 'Una publicación pendiente';
    c['draftPhotos'].set(['data:image/jpeg;base64,pendiente']);
    api.publish.mockReturnValue(throwError(() => ({ status: 503 })));
    await c['publish']();
    expect(c['text']).toBe('Una publicación pendiente');
    expect(c['draftPhotos']()).toHaveLength(1);
    expect(c['posts']()).toHaveLength(0);
    expect(c['profile']()?.postCount).toBe(0);
    expect(c['actionError']()).toContain('No se publicó');
  });
  it('cambia vista propia y visitante sin cambiar el rol ni perder la opción de volver', async () => {
    const { f, c, element } = await setup();
    c['profile'].update((p) => (p ? { ...p, role: 'Jugador', venues: [] } : p));
    c['togglePerspective']();
    f.detectChanges();
    expect(c['isSelf']()).toBe(false);
    expect(c['ownsProfile']()).toBe(true);
    expect(c['profile']()?.role).toBe('Jugador');
    expect(element.querySelector('[aria-label*="Volver a vista propia"]')).not.toBeNull();
    expect(element.querySelector('.avatar-change')).toBeNull();
    c['togglePerspective']();
    f.detectChanges();
    expect(c['isSelf']()).toBe(true);
    expect(element.querySelector('.avatar-change')).not.toBeNull();
  });
  it('no convierte un perfil ajeno en propio al alternar la vista', async () => {
    const { f, c, element } = await setup();
    f.componentRef.setInput('userId', 'owner-b');
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    c['togglePerspective']();
    expect(c['ownsProfile']()).toBe(false);
    expect(c['isSelf']()).toBe(false);
    expect(element.querySelector('.btn-perspective-eye')).toBeNull();
    expect(element.querySelector('.avatar-change')).toBeNull();
  });
  it('permite cerrar presentación y alternarla con editar perfil sin superponer formularios', async () => {
    const { c } = await setup();
    c['openSettings']();
    expect(c['settingsOpen']()).toBe(true);
    c['startEditingInfo']();
    expect(c['settingsOpen']()).toBe(false);
    expect(c['editingInfo']()).toBe(true);
    c['openSettings']();
    expect(c['editingInfo']()).toBe(false);
    expect(c['settingsOpen']()).toBe(true);
    c['openSettings']();
    expect(c['settingsOpen']()).toBe(false);
  });
  it('muestra un error real en lugar de fabricar perfiles, fotos de sedes o seguidores', async () => {
    const { api, c } = await setup();
    api.profile.mockReturnValue(throwError(() => ({ status: 503 })));
    await c['load']();
    expect(c['profile']()).toBeNull();
    expect(c['posts']()).toHaveLength(0);
    expect(c['error']()).toContain('No pudimos cargar');
  });
});
