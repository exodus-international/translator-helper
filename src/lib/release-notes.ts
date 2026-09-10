import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReleaseNote {
  version: string;
  content: string;
}

const RELEASE_NOTES_DIR = join(process.cwd(), 'release-notes');
const VERSION_FILENAME = /^v(\d+)\.(\d+)\.(\d+)\.md$/;

function compareVersionsDesc(a: string, b: string): number {
  const [aParts, bParts] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) {
    if (aParts[i] !== bParts[i]) return bParts[i] - aParts[i];
  }
  return 0;
}

/** Reads release-notes/vX.Y.Z.md files from disk, newest version first. */
export function getReleaseNotes(): ReleaseNote[] {
  let filenames: string[];
  try {
    filenames = readdirSync(RELEASE_NOTES_DIR);
  } catch {
    return [];
  }

  return filenames
    .map((filename) => {
      const match = filename.match(VERSION_FILENAME);
      if (!match) return null;
      const version = `${match[1]}.${match[2]}.${match[3]}`;
      const content = readFileSync(join(RELEASE_NOTES_DIR, filename), 'utf8');
      return { version, content };
    })
    .filter((note) => note !== null)
    .sort((a, b) => compareVersionsDesc(a.version, b.version));
}
