import { describe, it, expect } from 'vitest';
import { sanitizeClientEvent } from './monitoring';
describe('Privacidad del monitoreo', () => {
  it('elimina contraseñas, tokens, correos y datos de pago del evento', () => {
    const e = sanitizeClientEvent({
      user: { email: 'private@example.test' },
      request: { headers: { Authorization: 'secret' }, data: { cvv: '123' } },
      extra: { password: 'secret' },
      contexts: { auth: { token: 'secret' } },
      breadcrumbs: [{ message: 'secret' }],
      exception: {
        values: [
          {
            value: 'secret',
            stacktrace: {
              frames: [
                {
                  filename: 'https://example.test/main.js?token=secret',
                  vars: { password: 'secret' },
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(e)).not.toContain('secret');
    expect(JSON.stringify(e)).not.toContain('private@example.test');
    expect(e.exception.values[0].stacktrace.frames[0].filename).toBe(
      'https://example.test/main.js',
    );
  });
});
