import { defineConfig, devices } from '@playwright/test';

// Por defecto prueba la URL pública; para local: BASE_URL=http://localhost:4200
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'e2e/reporte', open: 'never' }]],
  use: {
    baseURL: process.env['BASE_URL'] ?? 'https://canchero-iota.vercel.app',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
});
