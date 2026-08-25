import { DocumentType } from '@prisma/client';
import { resolveFilePath } from '../github/github.paths';
import type { FilePathParams } from '../github/github.types';
import { AUDIO_FILE_EXTENSION } from './audio.types';

const REPO_PREFIX = 'translations/';
const AUDIO_PREFIX = 'audio/';

/**
 * Object key for a generated audio file. Mirrors the repo path of the
 * document so files are easy to find by hand, nests the audio record id as a
 * folder so a regeneration writes a new object instead of overwriting one a
 * copied URL points at, and ends in a human-readable filename, because a
 * browser names a cross-origin download after the last path segment and the
 * person uploading it into the CMS needs to know what it is.
 *
 *   translations/cs/exercises/lent2026/days/20.md
 *   -> audio/cs/exercises/lent2026/days/20/{audioFileId}/lent2026-cs-day-20.mp3
 */
export function resolveAudioObjectKey(params: FilePathParams & { audioFileId: string }): string {
  const repoPath = resolveFilePath(params);
  const withoutPrefix = repoPath.startsWith(REPO_PREFIX) ? repoPath.slice(REPO_PREFIX.length) : repoPath;
  const withoutExtension = withoutPrefix.replace(/\.[^./]+$/, '');
  return `${AUDIO_PREFIX}${withoutExtension}/${params.audioFileId}/${resolveAudioFilename(params)}`;
}

/**
 * The download name: project, language, document type and the document's own
 * name, e.g. `lent2026-cs-day-20.mp3`. Root files already have a telling name
 * so the type is left out for them.
 */
export function resolveAudioFilename(params: FilePathParams): string {
  const { documentType, languageCode, identifier, originalFilename, slug } = params;
  const base = slugify((originalFilename || slug).replace(/\.[^.]+$/, ''));
  const lang = slugify(languageCode);
  const project = slugify(identifier);

  const parts =
    documentType === DocumentType.DAILY_CONTENT
      ? [lang, 'daily-content', base]
      : documentType === DocumentType.ROOT_FILE
        ? [project, lang, base]
        : [project, lang, TYPE_SLUGS[documentType] ?? slugify(documentType), base];

  return `${parts.filter(Boolean).join('-')}.${AUDIO_FILE_EXTENSION}`;
}

const TYPE_SLUGS: Partial<Record<DocumentType, string>> = {
  [DocumentType.DAY]: 'day',
  [DocumentType.FIELD_GUIDE]: 'field-guide',
  [DocumentType.MEETING]: 'meeting',
};

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
