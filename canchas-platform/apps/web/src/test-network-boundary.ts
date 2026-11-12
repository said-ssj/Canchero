import { vi } from 'vitest';

// La suite unitaria usa HttpTestingController y transportes simulados.
// Nunca debe abrir sockets reales al proyecto que figure en .env.local.
// Las comprobaciones reales de Realtime se ejecutan aparte, contra su API.
class UnitWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = UnitWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly url: string) {}
  addEventListener() {}
  removeEventListener() {}
  send() {
    throw new Error('El transporte unitario no está conectado. Simula el canal en la prueba.');
  }
  close() {
    this.readyState = UnitWebSocket.CLOSED;
  }
}
vi.stubGlobal('WebSocket', UnitWebSocket);
