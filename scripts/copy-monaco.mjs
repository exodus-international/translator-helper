// Vendors monaco-editor's `min/vs` into `public/monaco/vs` so the editor
// loads from first-party hosting instead of the jsdelivr CDN at runtime.
// Runs on `postinstall` (dev + production installs) and is gitignored.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// monaco-editor's exports map does not expose ./package.json, so resolve
// the vendored copy through the direct-dependency symlink instead.
const src = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const dest = join(root, 'public', 'monaco', 'vs');

if (!existsSync(src)) {
  console.error(`[copy-monaco] not found: ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-monaco] vendored ${src} -> ${dest}`);
