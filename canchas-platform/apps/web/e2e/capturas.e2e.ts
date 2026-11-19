import { expect, test, type Page } from '@playwright/test';

// Rutas de app.routes.ts que no necesitan datos previos (ids, pagos en curso).
const PUBLICAS = [
  ['inicio', '/'],
  ['buscar', '/buscar'],
  ['sedes', '/sedes'],
  ['itinerario', '/itinerario'],
  ['login', '/login'],
  ['registro', '/registro'],
  ['recuperar', '/recuperar'],
  ['ayuda', '/ayuda'],
  ['terminos', '/terminos'],
  ['privacidad', '/privacidad'],
];

const ADMIN = [
  'sedes', 'canchas', 'reservas', 'caja', 'pos', 'catalogo', 'inventario', 'compras',
  'creditos', 'finanzas', 'reportes', 'personal', 'configuracion',
];

/** Visita la ruta, guarda captura de pantalla completa y el log de consola/red. */
async function capturar(page: Page, nombre: string, ruta: string, carpeta: string) {
  const log: string[] = [];
  const erroresJs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => erroresJs.push(e.message));
  page.on('requestfailed', (r) => log.push(`[red] ${r.method()} ${r.url()} → ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`);
  });

  const inicio = Date.now();
  await page.goto(ruta, { waitUntil: 'load' });
  // La app usa realtime/polling: networkidle puede no llegar nunca, se espera con tope.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const ms = Date.now() - inicio;

  const info = test.info();
  await page.screenshot({
    path: info.outputPath(`${carpeta}-${nombre}.png`),
    fullPage: true,
  });
  await info.attach(`${nombre}.png`, { path: info.outputPath(`${carpeta}-${nombre}.png`) });
  await info.attach(`${nombre}-debug.txt`, {
    body: [`ruta: ${ruta}`, `carga: ${ms} ms`, ...erroresJs.map((e) => `[pageerror] ${e}`), ...log].join('\n'),
    contentType: 'text/plain',
  });

  expect(erroresJs, `errores JS no capturados en ${ruta}`).toEqual([]);
}

for (const [nombre, ruta] of PUBLICAS) {
  test(`pública: ${nombre}`, async ({ page }) => {
    await capturar(page, nombre, ruta, 'publica');
  });
}

test.describe('panel admin', () => {
  const email = process.env['E2E_EMAIL'];
  const password = process.env['E2E_PASSWORD'];
  test.skip(!email || !password, 'define E2E_EMAIL y E2E_PASSWORD (cuenta dueño/admin) para capturar /admin');

  for (const nombre of ADMIN) {
    test(`admin: ${nombre}`, async ({ page }) => {
      await page.goto('/login');
      await page.locator('#email').fill(email!);
      await page.locator('#password').fill(password!);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/(admin|perfil)/, { timeout: 30_000 });
      await capturar(page, nombre, `/admin/${nombre}`, 'admin');
    });
  }
});
