import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmojiDialog } from './emoji-dialog';
import { insertEmoji } from './emoji-insertion';
@Component({
  selector: 'app-emoji-button',
  template: `<button
      type="button"
      [disabled]="disabled()"
      aria-label="Agregar emoji"
      title="Agregar emoji"
      (click)="open()"
    >
      <span class="material-symbols-outlined" aria-hidden="true">sentiment_satisfied</span>
    </button>
    @if (error()) {
      <span role="status" class="error">{{ error() }}</span>
    }`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--color-ink-600);
        cursor: pointer;
      }
      button:disabled {
        color: var(--color-ink-400);
        cursor: default;
      }
      button span {
        font-size: 22px;
        line-height: 1;
      }
      button:focus-visible {
        outline: 2px solid var(--color-brand-green);
        outline-offset: 3px;
      }
      .error {
        font-size: 11px;
        color: var(--color-danger);
        margin-left: 8px;
      }
    `,
  ],
})
export class EmojiButton {
  readonly target = input.required<HTMLTextAreaElement>();
  readonly disabled = input(false);
  protected readonly error = signal('');
  private readonly dialogs = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  protected open() {
    if (this.disabled()) return;
    this.error.set('');
    const target = this.target(),
      start = target.selectionStart,
      end = target.selectionEnd,
      original = target.value;
    this.dialogs
      .open(EmojiDialog, { width: '370px', maxWidth: 'calc(100vw - 24px)', restoreFocus: false })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((emoji: string | undefined) => {
        if (this.disabled() || !target.isConnected) return;
        if (!emoji) {
          target.focus();
          return;
        }
        const selection =
          target.value === original
            ? { start, end }
            : { start: target.selectionStart, end: target.selectionEnd };
        const result = insertEmoji(
          target.value,
          emoji,
          selection.start,
          selection.end,
          target.maxLength,
        );
        if (!result) {
          this.error.set('El emoji supera el límite de texto.');
          target.focus();
          return;
        }
        target.value = result.value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.focus();
        target.setSelectionRange(result.caret, result.caret);
      });
  }
}
