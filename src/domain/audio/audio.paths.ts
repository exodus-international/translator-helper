import { resolveFilePath } from '../github/github.paths';
import type { FilePathParams } from '../github/github.types';
import { AUDIO_FILE_EXTENSION } from './audio.types';

const REPO_PREFIX = 'translations/';
const AUDIO_PREFIX = 'audio/';

/**
 * Object key for a generated audio file. Mirrors the repo path of the
 * document so files are easy to find by hand, swaps the extension for the
 * audio format, and nests the audio record id so a regeneration writes a new
 * object instead of overwriting one a copied URL points at.
 *
 *   translations/cs/exercises/summer_2025/days/1.md
 *   -> audio/cs/exercises/summer_2025/days/1/{audioFileId}.mp3
 */
export function resolveAudioObjectKey(params: FilePathParams & { audioFileId: string }): string {
  const repoPath = resolveFilePath(params);
  const withoutPrefix = repoPath.startsWith(REPO_PREFIX) ? repoPath.slice(REPO_PREFIX.length) : repoPath;
  const withoutExtension = withoutPrefix.replace(/\.[^./]+$/, '');
  return `${AUDIO_PREFIX}${withoutExtension}/${params.audioFileId}.${AUDIO_FILE_EXTENSION}`;
}
