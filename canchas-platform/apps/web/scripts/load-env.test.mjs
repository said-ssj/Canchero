import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function run(extraEnv = {}) {
  const prefix = join(tmpdir(), 'canchero-env-test-');
  const directory = mkdtempSync(prefix);
  try {
    const root = join(directory, 'apps', 'web');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'src', 'environments'), { recursive: true });
    copyFileSync(join(dirname(fileURLToPath(import.meta.url)), 'load-env.mjs'),
      join(root, 'scripts', 'load-env.mjs'));
    const env = { ...process.env };
    for (const key of ['API_URL', 'VITE_API_URL', 'VERCEL', 'RENDER']) delete env[key];
    Object.assign(env, {
      SUPABASE_URL: 'https://ci-placeholder.supabase.co',
      SUPABASE_ANON_KEY: 'ci-placeholder-public-key',
      ...extraEnv,
    });
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'load-env.mjs')],
      { env, encoding: 'utf8' });
    const generated = join(root, 'src', 'environments', 'environment.local.ts');
    return { code: result.status, error: result.stderr,
      generated: existsSync(generated) ? readFileSync(generated, 'utf8') : null };
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('local development may omit API_URL', () => {
  assert.equal(run().code, 0);
});
test('Vercel and Render require explicit API_URL', () => {
  for (const env of [{ VERCEL: '1' }, { RENDER: 'true' }]) {
    const result = run(env);
    assert.equal(result.code, 1);
    assert.match(result.error, /API_URL es obligatoria/);
    assert.equal(result.generated, null);
  }
});
test('cloud refuses loopback and unencrypted APIs', () => {
  for (const API_URL of ['http://localhost:8080/api', 'https://localhost/api',
    'https://127.0.0.1/api', 'http://api.example.test/api']) {
    assert.equal(run({ VERCEL: '1', API_URL }).code, 1);
  }
});
test('cloud generates configured HTTPS API without trailing slash', () => {
  const result = run({ VERCEL: '1', API_URL: 'https://canchero.example.test/api/' });
  assert.equal(result.code, 0);
  assert.match(result.generated, /"apiUrl": "https:\/\/canchero.example.test\/api"/);
});
test('rejects credentials, query strings and missing API prefix', () => {
  for (const API_URL of ['https://user:pass@example.test/api',
    'https://example.test/api?token=x', 'https://example.test', 'https://example.test/api#x']) {
    assert.equal(run({ API_URL }).code, 1);
  }
});
test('local configured backend remains supported', () => {
  const result = run({ API_URL: 'http://localhost:8080/api' });
  assert.equal(result.code, 0);
  assert.match(result.generated, /localhost:8080/);
});

test('only public frontend Sentry settings enter the browser bundle', () => {
  const result = run({
    RESEND_API_KEY: 're_PRIVATE_TEST_VALUE',
    OPEN_METEO_API_KEY: 'PRIVATE_WEATHER_TEST',
    SENTRY_BACKEND_DSN: 'PRIVATE_BACKEND_TEST',
    SENTRY_FRONTEND_DSN: 'https://public@ingest.example.test/123',
    SENTRY_ENABLED: 'true',
    APP_AUTH_TOKEN_SECRET: 'PRIVATE_SESSION_SIGNING_TEST',
    SUPABASE_REALTIME_JWT_SECRET: 'PRIVATE_REALTIME_SIGNING_TEST',
  });
  assert.equal(result.code, 0);
  assert.match(result.generated, /"sentryEnabled": true/);
  assert.match(result.generated, /public@ingest.example.test/);
  assert.doesNotMatch(result.generated, /PRIVATE_TEST_VALUE|PRIVATE_WEATHER_TEST|PRIVATE_BACKEND_TEST|PRIVATE_SESSION_SIGNING_TEST|PRIVATE_REALTIME_SIGNING_TEST/);
});
