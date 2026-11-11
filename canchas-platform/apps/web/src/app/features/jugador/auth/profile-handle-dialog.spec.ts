import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { CommunityProfileService } from '@core/services/community-profile.service';
import { ProfileHandleDialog } from './profile-handle-dialog';
describe('Confirmación de identificador', () => {
  async function setup(canChange = true) {
    const api = {
      handleState: vi.fn(() =>
        of({ handle: 'actual', canChange, nextChangeAt: '2027-02-11T16:00:00Z' }),
      ),
      changeHandle: vi.fn(() =>
        of({ handle: 'nuevo', canChange: false, nextChangeAt: '2027-02-11T16:00:00Z' }),
      ),
    };
    const ref = { close: vi.fn(), disableClose: false };
    TestBed.configureTestingModule({
      imports: [ProfileHandleDialog],
      providers: [
        { provide: CommunityProfileService, useValue: api },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { handle: 'actual' } },
      ],
    });
    const f = TestBed.createComponent(ProfileHandleDialog);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return { f, c: f.componentInstance, api, ref };
  }
  it('muestra el aviso y solo guarda tras confirmarlo, conservando el resultado del servidor', async () => {
    const { f, c, api, ref } = await setup();
    expect(f.nativeElement.textContent).toContain('tres meses');
    c['handle'] = 'nuevo';
    await c['save']();
    expect(api.changeHandle).toHaveBeenCalledWith('nuevo');
    expect(ref.close).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'nuevo', canChange: false }),
    );
  });
  it('respeta el bloqueo del servidor y muestra cuándo se podrá cambiar', async () => {
    const { f, c, api } = await setup(false);
    c['handle'] = 'nuevo';
    await c['save']();
    expect(c['valid']()).toBe(false);
    expect(f.nativeElement.textContent).toContain('11 de febrero');
    expect(api.changeHandle).not.toHaveBeenCalled();
  });
  it('no anuncia éxito si el identificador está ocupado', async () => {
    const { c, api, ref } = await setup();
    c['handle'] = 'ocupado';
    api.changeHandle.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'Identificador ocupado' } })),
    );
    await c['save']();
    expect(ref.close).not.toHaveBeenCalled();
    expect(c['error']()).toContain('ocupado');
    expect(ref.disableClose).toBe(false);
  });
});
