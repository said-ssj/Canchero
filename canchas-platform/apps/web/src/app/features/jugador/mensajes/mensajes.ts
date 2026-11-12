import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ChatService, ChatMessage, Conversation } from '@core/services/chat.service';
import { RealtimeAuthService } from '@core/supabase/realtime-auth.service';
import { ChatReportDialog } from './report-dialog';

@Component({
  selector: 'app-mensajes',
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
  ],
  templateUrl: './mensajes.html',
  styleUrl: './mensajes.css',
})
export class Mensajes implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ChatService);
  private readonly realtime = inject(RealtimeAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(MatDialog);
  private readonly destroy = inject(DestroyRef);
  @ViewChild('history') private history?: ElementRef<HTMLElement>;
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly selected = signal<string | null>(null);
  protected readonly conversation = computed(() =>
    this.conversations().find((c) => c.id === this.selected()),
  );
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly busy = signal(true);
  protected readonly sending = signal(false);
  protected readonly loadingOlder = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal('');
  protected readonly actionError = signal('');
  protected readonly notice = signal('');
  protected readonly live = signal(false);
  protected readonly blocking = signal(false);
  protected draft = '';
  private retry?: { id: string; text: string; requestId: string };
  private generation = 0;
  private dead = false;
  private currentIdentity?: string;
  private reading = false;
  private listRequest?: Promise<void>;
  private messageRequest?: { id: string; generation: number; promise: Promise<void> };
  private poll?: ReturnType<typeof setInterval>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private channel?: Awaited<ReturnType<RealtimeAuthService['privateChannel']>>;

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      if (this.currentIdentity && this.currentIdentity !== userId) {
        this.dead = true;
        this.generation++;
        this.messages.set([]);
        this.conversations.set([]);
        this.selected.set(null);
        this.draft = '';
        clearInterval(this.poll);
        clearTimeout(this.refreshTimer);
        void this.channel?.unsubscribe();
        void this.router.navigate(['/login']);
      }
    });
    this.destroy.onDestroy(() => {
      this.dead = true;
      this.generation++;
      clearInterval(this.poll);
      clearTimeout(this.refreshTimer);
      void this.channel?.unsubscribe();
    });
  }
  async ngOnInit() {
    await this.auth.ready;
    if (this.dead) return;
    if (!this.auth.user()) {
      await this.router.navigate(['/login'], { queryParams: { returnUrl: '/mensajes' } });
      return;
    }
    this.currentIdentity = this.auth.user()!.id;
    await this.refresh();
    if (this.dead) return;
    const peer = this.route.snapshot.queryParamMap.get('usuario');
    if (peer) {
      try {
        const opened = await firstValueFrom(this.api.open(peer));
        if (this.dead) return;
        this.conversations.update((items) => [opened, ...items.filter((c) => c.id !== opened.id)]);
        await this.choose(opened.id);
        await this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      } catch (e) {
        this.error.set(this.reason(e, 'No se pudo abrir la conversación.'));
      }
    }
    void this.connect();
    this.poll = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, 30000);
  }
  private async connect() {
    try {
      const channel = await this.realtime.privateChannel(`chat-user:${this.auth.user()!.id}`);
      if (this.dead) {
        void channel.unsubscribe();
        return;
      }
      this.channel = channel;
      this.channel
        .on('broadcast', { event: 'changed' }, () => {
          clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => void this.refresh(), 150);
        })
        .subscribe((status) => {
          if (!this.dead) this.live.set(status === 'SUBSCRIBED');
        });
    } catch {
      if (!this.dead) this.live.set(false);
    }
  }
  protected async refresh() {
    if (this.listRequest) return this.listRequest;
    this.listRequest = this.reload();
    try {
      await this.listRequest;
    } finally {
      this.listRequest = undefined;
    }
  }
  private async reload() {
    try {
      const rows = await firstValueFrom(this.api.list());
      if (this.dead) return;
      this.conversations.set(rows);
      this.error.set('');
      if (this.selected()) await this.loadMessages(this.selected()!, false);
    } catch (e) {
      if (!this.dead) this.error.set(this.reason(e, 'No se pudieron cargar tus mensajes.'));
    } finally {
      if (!this.dead) this.busy.set(false);
    }
  }
  protected async choose(id: string) {
    this.generation++;
    this.selected.set(id);
    this.messages.set([]);
    this.hasMore.set(false);
    this.draft = '';
    this.retry = undefined;
    this.actionError.set('');
    await this.loadMessages(id, true);
  }
  protected back() {
    this.generation++;
    this.selected.set(null);
    this.messages.set([]);
  }
  private async loadMessages(id: string, bottom: boolean) {
    if (this.messageRequest?.id === id && this.messageRequest.generation === this.generation)
      return this.messageRequest.promise;
    const promise = this.fetchMessages(id, bottom);
    this.messageRequest = { id, generation: this.generation, promise };
    try {
      await promise;
    } finally {
      if (this.messageRequest?.promise === promise) this.messageRequest = undefined;
    }
  }
  private async fetchMessages(id: string, bottom: boolean) {
    const version = this.generation;
    const atBottom =
      bottom ||
      !this.history ||
      this.history.nativeElement.scrollHeight -
        this.history.nativeElement.scrollTop -
        this.history.nativeElement.clientHeight <
        70;
    try {
      const after = bottom ? undefined : this.messages().at(-1)?.id;
      const page = await firstValueFrom(this.api.messages(id, undefined, after));
      if (this.dead || version !== this.generation || id !== this.selected()) return;
      // Conserva las páginas antiguas al recibir mensajes nuevos.
      const merged = new Map(this.messages().map((m) => [m.id, m]));
      for (const item of page.items) merged.set(item.id, item);
      this.messages.set(
        [...merged.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)),
      );
      if (bottom) this.hasMore.set(page.hasMore);
      const last = page.items.at(-1);
      if (last && atBottom && document.visibilityState === 'visible') {
        await firstValueFrom(this.api.read(id, last.id));
        if (id === this.selected())
          this.conversations.update((items) =>
            items.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
          );
      }
      if (atBottom) this.scrollBottom();
      if (after && page.hasMore && version === this.generation) await this.fetchMessages(id, false);
    } catch (e) {
      if (version === this.generation)
        this.actionError.set(this.reason(e, 'No se pudo cargar la conversación.'));
    }
  }
  protected async older() {
    const id = this.selected(),
      first = this.messages()[0];
    if (!id || !first || this.loadingOlder()) return;
    this.loadingOlder.set(true);
    const version = this.generation;
    try {
      const page = await firstValueFrom(this.api.messages(id, first.id));
      if (version !== this.generation || this.dead) return;
      this.messages.update((items) => [...page.items, ...items]);
      this.hasMore.set(page.hasMore);
    } catch (e) {
      this.actionError.set(this.reason(e, 'No se pudieron cargar mensajes anteriores.'));
    } finally {
      this.loadingOlder.set(false);
    }
  }
  protected async historyScrolled() {
    const id = this.selected(),
      last = this.messages().at(-1),
      box = this.history?.nativeElement;
    if (
      !id ||
      !last ||
      !box ||
      this.reading ||
      !this.conversation()?.unread ||
      document.visibilityState !== 'visible' ||
      box.scrollHeight - box.scrollTop - box.clientHeight > 70
    )
      return;
    this.reading = true;
    try {
      await firstValueFrom(this.api.read(id, last.id));
      if (!this.dead)
        this.conversations.update((items) =>
          items.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
        );
    } catch {
      /* Conserva el contador: el próximo refresco podrá reintentar. */
    } finally {
      this.reading = false;
    }
  }
  protected async send() {
    const id = this.selected(),
      text = this.draft.trim();
    if (!id || !text || this.sending() || !this.conversation()?.canSend) return;
    this.sending.set(true);
    this.actionError.set('');
    if (!this.retry || this.retry.id !== id || this.retry.text !== text)
      this.retry = { id, text, requestId: crypto.randomUUID() };
    const attempt = this.retry;
    try {
      const message = await firstValueFrom(this.api.send(id, text, attempt.requestId));
      if (this.dead || this.selected() !== id) return;
      this.messages.update((items) =>
        items.some((m) => m.id === message.id) ? items : [...items, message],
      );
      if (this.draft.trim() === text) this.draft = '';
      this.retry = undefined;
      this.scrollBottom();
      await this.refresh();
    } catch (e) {
      if (this.selected() === id)
        this.actionError.set(this.reason(e, 'No se envió el mensaje. Puedes reintentar.'));
    } finally {
      this.sending.set(false);
    }
  }
  protected async toggleBlock() {
    const conversation = this.conversation();
    if (!conversation || this.blocking()) return;
    this.blocking.set(true);
    try {
      await firstValueFrom(this.api.block(conversation.peerId, !conversation.blockedByMe));
      await this.refresh();
    } catch (e) {
      this.actionError.set(this.reason(e, 'No se pudo actualizar el bloqueo.'));
    } finally {
      this.blocking.set(false);
    }
  }
  protected async report() {
    const id = this.selected();
    if (!id) return;
    const reason = await firstValueFrom(
      this.dialogs.open(ChatReportDialog, { width: '420px', maxWidth: '95vw' }).afterClosed(),
    );
    if (!reason) return;
    try {
      await firstValueFrom(this.api.report(id, reason));
      this.notice.set('Reporte guardado para revisión.');
    } catch (e) {
      this.actionError.set(this.reason(e, 'No se pudo guardar el reporte.'));
    }
  }
  private scrollBottom() {
    setTimeout(() => {
      if (!this.dead && this.history)
        this.history.nativeElement.scrollTop = this.history.nativeElement.scrollHeight;
    });
  }
  protected initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase();
  }
  protected imageError(event: Event) {
    (event.target as HTMLImageElement).hidden = true;
  }
  private reason(e: unknown, fallback: string) {
    return (e as { error?: { message?: string } })?.error?.message || fallback;
  }
}
