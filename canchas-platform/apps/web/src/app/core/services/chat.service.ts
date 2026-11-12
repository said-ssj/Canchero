import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';

export interface Conversation {
  id: string;
  peerId: string;
  name: string;
  photo: string | null;
  lastMessage: string | null;
  updatedAt: string;
  unread: number;
  blockedByMe: boolean;
  canSend: boolean;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  createdAt: string;
  requestId: string;
}
export interface MessagePage {
  items: ChatMessage[];
  hasMore: boolean;
}
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/chat`;
  list() {
    return this.http.get<Conversation[]>(`${this.base}/conversations`);
  }
  open(peerId: string) {
    return this.http.post<Conversation>(`${this.base}/conversations`, { peerId });
  }
  messages(id: string, before?: string, after?: string) {
    const params: Record<string, string> = {};
    if (before) params['before'] = before;
    if (after) params['after'] = after;
    return this.http.get<MessagePage>(`${this.base}/conversations/${id}/messages`, { params });
  }
  send(id: string, text: string, requestId: string) {
    return this.http.post<ChatMessage>(`${this.base}/conversations/${id}/messages`, {
      text,
      requestId,
    });
  }
  read(id: string, through: string) {
    return this.http.put<void>(`${this.base}/conversations/${id}/read`, { through });
  }
  block(peerId: string, enabled: boolean) {
    const url = `${this.base}/users/${peerId}/block`;
    return enabled ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }
  relationship(peerId: string) {
    return this.http.get<{ blockedByMe: boolean }>(`${this.base}/users/${peerId}/relationship`);
  }
  report(id: string, reason: string) {
    return this.http.post<void>(`${this.base}/conversations/${id}/reports`, { reason });
  }
}
