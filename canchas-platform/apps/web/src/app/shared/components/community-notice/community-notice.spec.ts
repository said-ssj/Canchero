import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ChatService, CommunityRestriction } from '@core/services/chat.service';
import { CommunityNotice } from './community-notice';
describe('Aviso de revisión', () => {
  it('shows a verified restriction without hiding reservations and clears it when identity changes', async () => {
    const user = signal<{ id: string } | null>({ id: 'first' }),
      pending = new Subject<CommunityRestriction>();
    const status = vi
      .fn()
      .mockReturnValueOnce(
        of({ restricted: true, underReview: true, until: '2026-11-13T10:00:00Z' }),
      )
      .mockReturnValue(pending);
    TestBed.configureTestingModule({
      imports: [CommunityNotice],
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: ChatService, useValue: { status } },
      ],
    });
    const fixture = TestBed.createComponent(CommunityNotice);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('reservas y pases siguen disponibles');
    user.set({ id: 'second' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('restringidos temporalmente');
    user.set(null);
    fixture.detectChanges();
    pending.next({ restricted: true, underReview: true, until: null });
    pending.complete();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
