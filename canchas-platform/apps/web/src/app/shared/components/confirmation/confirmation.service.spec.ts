import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ConfirmationService } from './confirmation.service';

describe('Danger confirmation', () => {
  it('requires explicit true, including when dismissed with Escape or backdrop', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
    const service = TestBed.inject(ConfirmationService);
    const data = { title: 'Confirmar', message: 'Accion sensible', confirmLabel: 'Confirmar accion' };
    for (const result of [undefined, false, true]) {
      open.mockReturnValue({ afterClosed: () => of(result) });
      expect(await service.confirm(data)).toBe(result === true);
    }
    expect(open.mock.calls[0][1]).toMatchObject({ autoFocus: '[data-cancel]', restoreFocus: true });
  });
});
