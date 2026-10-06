import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monorepoRoot = resolve(webRoot, '../..');
const envPath = resolve(monorepoRoot, '.env.local');
const outputPath = resolve(webRoot, 'src/environments/environment.local.ts');

function parseEnv(contents) {
  const values = {};

  for (const line of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;

    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return values;
}

const fileValues = existsSync(envPath)
  ? parseEnv(readFileSync(envPath, 'utf8'))
  : {};
const value = (...candidates) => candidates.find((candidate) => candidate?.trim());
const supabaseUrl = value(
  process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
  fileValues.SUPABASE_URL,
  fileValues.VITE_SUPABASE_URL,
);
const anonKey = value(
  process.env.SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY,
  fileValues.SUPABASE_ANON_KEY,
  fileValues.VITE_SUPABASE_ANON_KEY,
);

if (!supabaseUrl || !anonKey) {
  if (existsSync(outputPath)) unlinkSync(outputPath);
  console.error(
    `Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY. Configúralas en ${envPath} ` +
      'o como variables de entorno antes de iniciar o compilar la app.',
  );
  process.exit(1);
}

if (/YOUR_PROJECT_REF|TU_PROJECT_REF|your-supabase-publishable-key|TU_CLAVE_PUBLISHABLE_O_ANON/i.test(`${supabaseUrl} ${anonKey}`)) {
  if (existsSync(outputPath)) unlinkSync(outputPath);
  console.error(`Reemplaza los valores de ejemplo de Supabase en ${envPath} antes de iniciar o compilar la app.`);
  process.exit(1);
}

if (anonKey.startsWith('sb_secret_')) {
  if (existsSync(outputPath)) unlinkSync(outputPath);
  console.error('No uses una clave secreta de Supabase en el frontend. Usa la clave publishable/anon.');
  process.exit(1);
}

try {
  const parsedUrl = new URL(supabaseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const isLocalHttp = parsedUrl.protocol === 'http:' && localHosts.has(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('La URL debe usar HTTPS, excepto en localhost.');
  }
} catch (error) {
  console.error(`SUPABASE_URL no es válida: ${error.message}`);
  process.exit(1);
}

const generated = {
  url: supabaseUrl.replace(/\/+$/, ''),
  anonKey,
};

writeFileSync(
  outputPath,
  `export const supabaseConfiguration = Object.freeze(${JSON.stringify(generated, null, 2)});\n`,
  'utf8',
);
console.log('Configuración de Supabase cargada para el frontend.');
