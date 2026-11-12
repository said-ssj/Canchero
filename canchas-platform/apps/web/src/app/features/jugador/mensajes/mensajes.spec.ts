import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ChatService, ChatMessage, Conversation } from '@core/services/chat.service';
import { RealtimeAuthService } from '@core/supabase/realtime-auth.service';
import { Mensajes } from './mensajes';

describe('Mensajería privada', () => {
  const conversation: Conversation = {
    id: 'conversation-one',
    peerId: 'peer',
    name: 'Nombre y Apellidos Completos',
    photo: null,
    lastMessage: null,
    updatedAt: '2026-11-11T20:00:00Z',
    unread: 0,
    blockedByMe: false,
    canSend: true,
  };
  const message: ChatMessage = {
    id: '9007199254740993',
    conversationId: conversation.id,
    authorId: 'peer',
    text: '<script>alert(1)</script>',
    createdAt: '2026-11-11T20:00:00Z',
    requestId: 'request-one',
  };
  async function setup() {
    const api = {
      list: vi.fn(() => of([conversation])),
      open: vi.fn(() => of(conversation)),
      messages: vi.fn(() => of({ items: [message], hasMore: false })),
      read: vi.fn(() => of(undefined)),
      send: vi.fn(() => of({ ...message, authorId: 'me', text: 'Hola' })),
      block: vi.fn(() => of(undefined)),
      report: vi.fn(() => of(undefined)),
    };
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Mensajes],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: AuthService,
          useValue: { ready: Promise.resolve(), user: signal({ id: 'me' }) },
        },
        { provide: ChatService, useValue: api },
        { provide: RealtimeAuthService, useValue: { privateChannel: vi.fn(() => channel) } },
      ],
    });
    const fixture = TestBed.createComponent(Mensajes);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalledOnce());
    return { fixture, page: fixture.componentInstance as any, api, channel };
  }
  it('escapes messages, preserves large IDs and marks only the displayed history as read', async () => {
    const { fixture, page, api } = await setup();
    await page.choose(conversation.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(message.text);
    expect(fixture.nativeElement.querySelector('.bubble script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(conversation.name);
    expect(api.read).toHaveBeenCalledWith(conversation.id, message.id);
    expect(page.messages()[0].id).toBe('9007199254740993');
  });
  it('reuses the request ID after an uncertain send failure', async () => {
    const { page, api } = await setup();
    await page.choose(conversation.id);
    api.send.mockReturnValueOnce(throwError(() => ({ status: 0 })) as any);
    page.draft = 'Hola';
    await page.send();
    expect(page.draft).toBe('Hola');
    const first = api.send.mock.calls[0] as unknown[];
    await page.send();
    const second = api.send.mock.calls[1] as unknown[];
    expect(first[2]).toBe(second[2]);
    expect(page.draft).toBe('');
  });
  it('discards a late response after selecting another conversation', async () => {
    const { page, api } = await setup();
    const pending = new Subject<{ items: ChatMessage[]; hasMore: boolean }>();
    api.messages.mockReturnValueOnce(pending as any);
    const first = page.choose(conversation.id);
    await page.choose('conversation-two');
    pending.next({ items: [{ ...message, text: 'Respuesta vieja' }], hasMore: false });
    pending.complete();
    await first;
    expect(page.messages().some((m: ChatMessage) => m.text === 'Respuesta vieja')).toBe(false);
  });
  it('shows an error and preserves the composer when the server blocks sending', async () => {
    const { page, api } = await setup();
    await page.choose(conversation.id);
    api.send.mockReturnValueOnce(
      throwError(() => ({
        error: { message: 'Esta conversación no permite nuevos mensajes' },
      })) as any,
    );
    page.draft = 'Hola';
    await page.send();
    expect(page.actionError()).toContain('no permite');
    expect(page.draft).toBe('Hola');
  });
  it('removes subscriptions when leaving the page', async () => {
    const { fixture, channel } = await setup();
    fixture.destroy();
    expect(channel.unsubscribe).toHaveBeenCalledOnce();
  });
});
