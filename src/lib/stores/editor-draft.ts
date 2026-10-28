/**
 * A copy of the editor's unsaved text, kept in the browser so that leaving the
 * editor unplanned does not lose it. The case it exists for is an expired
 * session: the next server action redirects to the login page, and whatever
 * was typed since the last save would go with the page.
 *
 * The copy is keyed by document version and remembers a hash of the saved text
 * it was typed over, so the editor can tell when the server's copy has moved on
 * since. Storage can be missing or refuse writes (private windows, full
 * quota, server render), so every access is guarded and a failure only means
 * no draft.
 */

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Draft {
  content: string;
  /** True when the saved text is no longer the one the draft was typed over. */
  baseChanged: boolean;
}

interface StoredDraft {
  content: string;
  baseHash: string;
  savedAt: string;
}

export function draftKey(versionId: string): string {
  return `editor-draft:${versionId}`;
}

/** A short, stable fingerprint of a text. Not for security, only for "is it the same". */
export function contentHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

export function writeDraft(
  storage: DraftStorage | null,
  versionId: string,
  draft: { content: string; savedContent: string },
  now = new Date(),
): void {
  if (!storage) return;
  const stored: StoredDraft = {
    content: draft.content,
    baseHash: contentHash(draft.savedContent),
    savedAt: now.toISOString(),
  };
  try {
    storage.setItem(draftKey(versionId), JSON.stringify(stored));
  } catch {
    // Quota or a blocked storage: there is nowhere to keep it.
  }
}

/**
 * The draft for a version, or null when there is none worth offering: nothing
 * stored, something unreadable, or text the server already has.
 */
export function readDraft(storage: DraftStorage | null, versionId: string, serverContent: string): Draft | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey(versionId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let stored: Partial<StoredDraft>;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof stored?.content !== 'string' || stored.content === serverContent) return null;
  return { content: stored.content, baseChanged: stored.baseHash !== contentHash(serverContent) };
}

export function clearDraft(storage: DraftStorage | null, versionId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(draftKey(versionId));
  } catch {
    // Nothing to do: a draft that cannot be removed is offered again and can be dismissed then.
  }
}

/**
 * The tab's sessionStorage, looked up on each call so that importing this on
 * the server is harmless. A draft survives the trip to the login page and
 * back in the same tab, and ends with it.
 */
export const sessionDraftStorage: DraftStorage = {
  getItem: (key) => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // See writeDraft.
    }
  },
  removeItem: (key) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // See clearDraft.
    }
  },
};
