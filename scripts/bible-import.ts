/**
 * Imports bible-api data into the in-app Bible.
 *
 *   pnpm bible:import <data-dir> [code ...]
 *
 * <data-dir> is a bible-api `data/` directory: `normalized/<code>.json` holds a
 * translation and `versification/<code>.json` its declarations. With no codes,
 * imports every translation there, the source first. Re-running replaces a
 * translation in place.
 */
import 'dotenv/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importTranslation } from '../src/domain/bible/bible.import';
import { catalogMeta } from '../src/domain/bible/lib/translations';

async function main() {
  const [dir, ...only] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: pnpm bible:import <bible-api data dir> [code ...]');
    process.exit(2);
  }
  const normalized = path.join(dir, 'normalized');
  if (!existsSync(normalized)) {
    console.error(`No ${normalized} directory.`);
    process.exit(2);
  }
  const codes = (only.length ? only : readdirSync(normalized).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
    // The source goes first: targets are mapped against it.
    .sort((a, b) => Number(catalogMeta(b)?.role === 'source') - Number(catalogMeta(a)?.role === 'source'));

  let failed = 0;
  for (const code of codes) {
    const file = path.join(normalized, `${code}.json`);
    const versification = path.join(dir, 'versification', `${code}.json`);
    const started = Date.now();
    try {
      const result = await importTranslation({
        translationText: readFileSync(file, 'utf8'),
        declarationsText: existsSync(versification) ? readFileSync(versification, 'utf8') : null,
        meta: { code },
        userId: null,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `${code}: ${result.books} books, ${result.verses} verses, ${result.declaredBooks} declared books` +
          `${result.replaced ? ' (replaced)' : ''} in ${seconds}s`,
      );
      for (const w of result.warnings) console.log(`  ${w}`);
    } catch (error) {
      failed++;
      console.error(`${code}: ${error instanceof Error ? error.message : error}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
