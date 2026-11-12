import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createClient } from '@supabase/supabase-js';
import { environment } from '@env/environment';
import { AuthService } from '../auth/auth.service';

interface RealtimeToken {
  accessToken: string;
  expiresAt: number;
  userId: string;
}

/** Cliente privado independiente del cliente público y del flujo OAuth de Google. */
@Injectable({ providedIn: 'root' })
export class RealtimeAuthService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private cached?: RealtimeToken & { session: string };
  private pending?: { session: string; request: Promise<string> };
  private readonly client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    accessToken: () => this.accessToken(),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  constructor() {
    let previousUser: string | undefined;
    effect(() => {
      const user = this.auth.user()?.id;
      if (previousUser !== user) {
        this.cached = undefined;
        void this.client.removeAllChannels();
      }
      previousUser = user;
    });
    inject(DestroyRef).onDestroy(() => {
      void this.client.removeAllChannels();
    });
  }

  async privateChannel(topic: string) {
    const session = this.auth.authToken();
    const token = await this.accessToken();
    // subscribe() es síncrono: sin este paso el primer join puede salir sin JWT.
    await this.client.realtime.setAuth(token);
    if (session !== this.auth.authToken())
      throw new Error('La sesión cambió; vuelve a conectar Realtime.');
    return this.client.channel(topic, { config: { private: true } });
  }

  async accessToken(): Promise<string> {
    await this.auth.ready;
    const session = this.auth.authToken();
    if (!session || !this.auth.user()) {
      this.cached = undefined;
      throw new Error('Inicia sesión para conectar Realtime.');
    }
    if (this.cached?.session === session && this.cached.expiresAt * 1000 > Date.now() + 30000)
      return this.cached.accessToken;
    if (this.pending?.session === session) return this.pending.request;
    const request = this.exchange(session);
    this.pending = { session, request };
    try {
      return await request;
    } finally {
      if (this.pending?.request === request) this.pending = undefined;
    }
  }

  private async exchange(session: string): Promise<string> {
    const token = await firstValueFrom(
      this.http.post<RealtimeToken>(
        `${environment.apiUrl}/auth/realtime-token`,
        {},
        { headers: { Authorization: `Bearer ${session}` } },
      ),
    );
    if (
      session !== this.auth.authToken() ||
      token.userId !== this.auth.user()?.id ||
      !token.accessToken ||
      token.expiresAt * 1000 <= Date.now()
    )
      throw new Error('La sesión cambió; vuelve a conectar Realtime.');
    this.cached = { ...token, session };
    return token.accessToken;
  }
}
