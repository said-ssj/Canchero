import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly message = signal('');
  readonly visible = signal(false);
  private timeout?: ReturnType<typeof setTimeout>;

  show(msg: string, durationMs = 3200): void {
    if (!msg) return;
    this.message.set(msg);
    this.visible.set(true);
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => {
      this.visible.set(false);
    }, durationMs);
  }

  hide(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.visible.set(false);
  }
}
