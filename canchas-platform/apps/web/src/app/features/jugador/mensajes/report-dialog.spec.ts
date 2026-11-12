import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { ChatReportDialog } from './report-dialog';
describe('Motivos de reporte', () => {
  it('requires details for Otros but permits a structured reason without inventing details', async () => {
    TestBed.configureTestingModule({
      imports: [ChatReportDialog],
      providers: [{ provide: MatDialogRef, useValue: { close: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(ChatReportDialog),
      page = fixture.componentInstance as any;
    fixture.detectChanges();
    await fixture.whenStable();
    const submit = () => fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    page.category = 'otros';
    page.reason = 'Corto';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submit().disabled).toBe(true);
    page.reason = 'Descripción concreta del problema';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submit().disabled).toBe(false);
    page.category = 'spam';
    page.reason = '';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(submit().disabled).toBe(false);
  });
});
