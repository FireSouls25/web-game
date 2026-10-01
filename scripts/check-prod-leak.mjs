/**
 * Fails if any PROD source file statically imports src/dev/.
 * Dev code must only load via dynamic import() behind import.meta.env.DEV.
 * Usage: npm run check:prod-leak
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;
const offenders = [];

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (p.endsWith('/src/dev')) continue; // dev importing dev is fine
      walk(p);
    } else if (/\.(ts|tsx)$/.test(p)) {
      const src = readFileSync(p, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) return;
        // static import / export-from dev path outside src/dev
        if (/^(import|export)[^'"]*['"][^'"]*(\.\.?\/)*dev\//.test(t) ||
            /from\s+['"][^'"]*\/dev\//.test(t)) {
          offenders.push(`${p}:${i + 1}: ${t}`);
        }
      });
    }
  }
}

walk(SRC);
if (offenders.length) {
  console.error('PROD LEAK: static imports of src/dev/ found in prod code:\n' + offenders.join('\n'));
  process.exit(1);
}
console.log('OK: no static src/dev imports in prod code.');
