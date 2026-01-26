import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const distDir = new URL('../dist', import.meta.url).pathname;

let entries;
try {
  entries = readdirSync(distDir);
} catch (error) {
  console.error('dist directory not found. Run pnpm build:single first.');
  process.exit(1);
}

const files = entries.filter((entry) => !entry.startsWith('.'));
if (files.length !== 1 || files[0] !== 'index.html') {
  console.error(`Expected only index.html in dist, found: ${files.join(', ')}`);
  process.exit(1);
}

const indexPath = join(distDir, 'index.html');
const stats = statSync(indexPath);
if (stats.size <= 0) {
  console.error('index.html is empty.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
if (/<script[^>]+src=/i.test(html)) {
  console.error('index.html still references external scripts.');
  process.exit(1);
}
if (/<link[^>]+rel=["\']stylesheet["\']/i.test(html)) {
  console.error('index.html still references external stylesheets.');
  process.exit(1);
}

console.log('verify:single passed.');
