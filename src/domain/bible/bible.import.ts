import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { prepareDeclarations, prepareTranslation } from './bible.prepare';
import { BibleImportError, replaceDeclarations, writeTranslation } from './bible.repository';
import { invalidateBibleIndex } from './bible.service';
import { declarationsSchema, normalizedTranslationSchema, translationMetaSchema, type TranslationMeta } from './bible.types';
import { catalogMeta, defaultMeta } from './lib/translations';

/**
 * Imports a bible-api translation file (and optionally its versification file)
 * into the database. Shared by the admin upload route and the CLI. Callers
 * authorize.
 */

/** A Bible's normalized JSON is 5-7 MB; anything far past that is not one. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
/** What the browser sends after gzip; under the proxy's 10 MB body limit. */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

const GZIP_MAGIC = [0x1f, 0x8b];

/** File bytes (gzipped or not) to text, refusing anything that inflates past MAX_FILE_BYTES. */
export function decodeUpload(bytes: Uint8Array): string {
  const gzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
  if (!gzipped && bytes.byteLength > MAX_FILE_BYTES) throw new BibleImportError('The file is too large.');
  let raw: Buffer;
  try {
    raw = gzipped ? gunzipSync(bytes, { maxOutputLength: MAX_FILE_BYTES }) : Buffer.from(bytes);
  } catch (error) {
    if (error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new BibleImportError('The file is too large once unpacked.');
    }
    throw new BibleImportError('The file could not be unpacked.');
  }
  return raw.toString('utf8');
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BibleImportError(`The ${what} file is not JSON.`);
  }
}

function describeIssues(error: z.ZodError, what: string): BibleImportError {
  const issues = error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(file)'}: ${i.message}`)
    .join('; ');
  return new BibleImportError(`The ${what} file is not in the bible-api format (${issues}).`);
}

export function parseTranslationFile(text: string) {
  const parsed = normalizedTranslationSchema.safeParse(parseJson(text, 'translation'));
  if (!parsed.success) throw describeIssues(parsed.error, 'translation');
  return parsed.data;
}

export function parseDeclarationsFile(text: string) {
  const parsed = declarationsSchema.safeParse(parseJson(text, 'versification'));
  if (!parsed.success) throw describeIssues(parsed.error, 'versification');
  return parsed.data;
}

/** The import dialog's labels, so an error names the field to fill in. */
const META_LABELS: Record<string, string> = {
  code: 'Code',
  name: 'Name',
  languageCode: 'Language code',
  languageName: 'Language name',
  role: 'Role',
};

const listOf = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * The import's metadata: what the admin typed over the defaults for the code
 * (the catalog's for a known one, guessed from the code for any other).
 */
export function resolveMeta(code: string, overrides: Partial<TranslationMeta>): TranslationMeta {
  const given = stripEmpty(overrides);
  const merged: Record<string, unknown> = { ...stripEmpty(defaultMeta(code, given.languageCode)), ...given, code };
  const parsed = translationMetaSchema.safeParse(merged);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    const label = (f: string) => META_LABELS[f] ?? f;
    const missing = fields.filter((f) => merged[f] === undefined).map(label);
    const invalid = fields.filter((f) => merged[f] !== undefined).map(label);
    const parts = [
      missing.length &&
        (catalogMeta(code) ? `Fill in ${listOf(missing)}.` : `'${code}' isn't one of the built-in Bibles: fill in ${listOf(missing)}.`),
      invalid.length && `Check ${listOf(invalid)}.`,
    ].filter(Boolean);
    throw new BibleImportError(parts.join(' '));
  }
  return parsed.data;
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;
}

export interface ImportInput {
  translationText: string;
  declarationsText?: string | null;
  meta?: Partial<TranslationMeta>;
  userId: string | null;
}

export async function importTranslation({ translationText, declarationsText, meta, userId }: ImportInput) {
  const norm = parseTranslationFile(translationText);
  const resolved = resolveMeta(meta?.code || norm.code, meta ?? {});
  const declarations = declarationsText ? parseDeclarationsFile(declarationsText) : null;
  if (declarations && declarations.translation !== resolved.code) {
    throw new BibleImportError(
      `The versification file is for '${declarations.translation}', not '${resolved.code}'.`,
    );
  }
  if (declarations && resolved.role === 'source') {
    throw new BibleImportError('The source translation takes no versification file.');
  }
  const prepared = prepareTranslation(norm, resolved, declarations);
  if (prepared.books.length === 0) throw new BibleImportError('The file holds no verses.');
  const result = await writeTranslation(prepared, userId);
  invalidateBibleIndex();
  return { ...result, warnings: prepared.warnings };
}

export async function importDeclarations(code: string, declarationsText: string) {
  const declarations = parseDeclarationsFile(declarationsText);
  if (declarations.translation !== code) {
    throw new BibleImportError(`The versification file is for '${declarations.translation}', not '${code}'.`);
  }
  const result = await replaceDeclarations(code, prepareDeclarations(declarations));
  invalidateBibleIndex();
  return result;
}
