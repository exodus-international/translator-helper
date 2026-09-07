// Vendors monaco-editor's `min/vs` into `public/monaco/vs` so the editor
// loads from first-party hosting instead of the jsdelivr CDN at runtime.
// Runs on `postinstall` (dev + production installs) and is gitignored.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const pkgPath = require.resolve('monaco-editor/package.json');
const src = join(dirname(pkgPath), 'min', 'vs');
const dest = join(root, 'public', 'monaco', 'vs');
const stamp = join(root, 'public', 'monaco', '.version');
const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

if (!existsSync(src)) {
  console.error(`[copy-monaco] not found: ${src}`);
  process.exit(1);
}

// Nothing to do when the vendored copy is already this version. Worth the
// check: the copy below deletes the directory before rewriting it, and a dev
// server serving /monaco/vs during that window hands the browser a 404 that
// surfaces as "Monaco initialization: error". Skipping leaves no window.
if (existsSync(join(dest, 'loader.js')) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === version) {
  console.log(`[copy-monaco] public/monaco/vs is already monaco-editor ${version}`);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
writeFileSync(stamp, `${version}\n`);
console.log(`[copy-monaco] vendored monaco-editor ${version}: ${src} -> ${dest}`);
