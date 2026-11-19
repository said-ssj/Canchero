#!/usr/bin/env node
// Mide rendimiento por página (módulo) y genera reportes/<fuente>-<fecha>.md + JSON/HTML.
//   node scripts/rendimiento.mjs lighthouse   → Lighthouse local (Chromium de Playwright o CHROME_PATH)
//   node scripts/rendimiento.mjs pagespeed    → API de pagespeed.web.dev (requiere PSI_API_KEY)
// BASE_URL cambia el sitio (por defecto la URL pública de Vercel).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const fuente = process.argv[2] ?? 'lighthouse';
const base = (process.env.BASE_URL ?? 'https://canchero-iota.vercel.app').replace(/\/$/, '');
const rutas = ['/', '/buscar', '/sedes', '/itinerario', '/login', '/registro', '/ayuda'];
const modos = ['mobile', 'desktop'];
const cats = ['performance', 'accessibility', 'best-practices', 'seo'];
const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dir = join('reportes', `${fuente}-${fecha}`);
mkdirSync(dir, { recursive: true });

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pw = join(homedir(), '.cache', 'ms-playwright');
  const shell = existsSync(pw) && readdirSync(pw).find((d) => d.startsWith('chromium_headless_shell'));
  if (!shell) throw new Error('Sin Chrome: define CHROME_PATH o ejecuta "npx playwright install chromium"');
  return join(pw, shell, 'chrome-linux', 'headless_shell');
}

async function medir(ruta, modo) {
  const url = base + ruta;
  const nombre = `${ruta === '/' ? 'inicio' : ruta.slice(1)}-${modo}`;
  if (fuente === 'pagespeed') {
    const key = process.env.PSI_API_KEY;
    if (!key) throw new Error('Define PSI_API_KEY (Google Cloud → API PageSpeed Insights → credenciales)');
    const q = new URLSearchParams({ url, strategy: modo, key });
    cats.forEach((c) => q.append('category', c));
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`);
    const json = await res.json();
    if (json.error) throw new Error(`${url}: ${json.error.message}`);
    writeFileSync(join(dir, `${nombre}.json`), JSON.stringify(json));
    return json.lighthouseResult;
  }
  const salida = join(dir, nombre);
  execFileSync('npx', ['-y', 'lighthouse@12.8.2', url, '--quiet', '--chrome-flags=--headless',
    '--output=json', '--output=html', `--output-path=${salida}`,
    ...(modo === 'desktop' ? ['--preset=desktop'] : [])], {
    stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CHROME_PATH: chrome() },
  });
  return JSON.parse(readFileSync(`${salida}.report.json`, 'utf8'));
}

const filas = [];
for (const ruta of rutas) {
  for (const modo of modos) {
    process.stdout.write(`${modo.padEnd(7)} ${ruta} … `);
    const lh = await medir(ruta, modo);
    const a = lh.audits;
    const fila = [ruta, modo, ...cats.map((c) => Math.round(lh.categories[c].score * 100)),
      a['first-contentful-paint'].displayValue, a['largest-contentful-paint'].displayValue,
      a['total-blocking-time'].displayValue, a['cumulative-layout-shift'].displayValue];
    filas.push(fila);
    console.log(fila.slice(2, 6).join(' / '));
  }
}

const md = [`# ${fuente} — ${base} — ${fecha}`, '',
  '| Página | Modo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | FCP | LCP | TBT | CLS |',
  '|---|---|---|---|---|---|---|---|---|---|', ...filas.map((f) => `| ${f.join(' | ')} |`), '',
  'Valores de laboratorio (una sola corrida); repetir 3 veces y promediar antes de concluir.'].join('\n');
writeFileSync(join(dir, 'resumen.md'), md + '\n');
console.log(`\n${join(dir, 'resumen.md')}`);
