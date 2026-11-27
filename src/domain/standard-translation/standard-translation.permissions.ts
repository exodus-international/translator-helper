import { authorize } from '@/lib/authorize';
import { getStandardTranslationById } from './standard-translation.repository';

type Authorize = typeof authorize;

export interface EntryPermissionDeps<Entry extends { languageId: string }> {
  getEntry: (id: string) => Promise<Entry | null>;
  authorize: Authorize;
}

export function createEntryPermissions<Entry extends { languageId: string }>(deps: EntryPermissionDeps<Entry>) {
  /**
   * The one rule for changing an existing entry: a member of its language's
   * team, in any role, or an admin. The language is the stored entry's, read
   * before the check, never one from the input, so a member of one language
   * can't reach another language's entries by their ids.
   */
  async function authorizeEntry(id: string) {
    const entry = await deps.getEntry(id);
    if (!entry) throw new Error('Standard translation not found');

    const { user } = await deps.authorize({ language: entry.languageId, role: 'member' });
    return { entry, user };
  }

  return { authorizeEntry };
}

export const { authorizeEntry } = createEntryPermissions({ getEntry: getStandardTranslationById, authorize });
