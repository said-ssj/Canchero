import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('emoji-picker-element-data/package.json'));
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets/emojis');
mkdirSync(destination, { recursive: true });
copyFileSync(resolve(root, 'es/cldr-native/data.json'), resolve(destination, 'data.json'));
copyFileSync(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE'));
