import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Diagnóstico remoto de solo lectura. Nunca imprime claves, JWT, usuarios o filas.
const values = {};
for (const line of readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
}
const url = (process.env.SUPABASE_URL || values.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_ANON_KEY || values.SUPABASE_ANON_KEY || '';
if (!url.startsWith('https://') || !key || key.startsWith('sb_secret_')) {
  throw new Error('Configura SUPABASE_URL y una clave pública publishable/anon.');
}
if (key.split('.').length === 3) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  if (claims.role !== 'anon') throw new Error('No se permite una clave privilegiada en SUPABASE_ANON_KEY.');
}
try {
  const result = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(12000),
  });
  if (!result.ok) {
    console.error(`Supabase Auth: HTTP ${result.status}. Revisa la clave pública vigente del proyecto; no la confundas con la firma de sesiones.`);
    process.exitCode = 1;
  } else {
    const data = await result.json();
    console.log(`Supabase Auth: OK. Google: ${data.external?.google === true ? 'habilitado' : 'deshabilitado'}.`);
  }
  const jwks = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(12000) });
  if (!jwks.ok) throw new Error(`JWKS HTTP ${jwks.status}`);
  const data = await jwks.json();
  console.log(`Algoritmos publicados en JWKS: ${[...new Set(data.keys?.map(k => k.alg) ?? [])].join(', ') || 'sin claves asimétricas'}.`);
  console.log('Las sesiones canchero.v1 son exclusivas de Spring; el puente /api/auth/realtime-token emite la credencial separada de Supabase.');
} catch {
  console.error('No se pudo completar el diagnóstico de Supabase. Revisa la red y vuelve a intentarlo.');
  process.exitCode = 1;
}
