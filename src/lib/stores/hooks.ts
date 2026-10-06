'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useEditorStore } from './editor-provider';

/**
 * Auto-save hook. Call in translate page only.
 * Debounces saves by `delayMs` ms after content changes.
 */
export function useAutoSave(opts?: { delayMs?: number; enabled?: boolean }) {
  const delayMs = opts?.delayMs ?? 3000;
  const enabled = opts?.enabled ?? true;

  const content = useEditorStore((s) => s.content);
  const savedContent = useEditorStore((s) => s.savedContent);
  const saveContent = useEditorStore((s) => s.saveContent);
  const targetVersion = useEditorStore((s) => s.targetVersion);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const savingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!targetVersion || targetVersion.status === 'PENDING_TRANSLATION') return;
    if (content === savedContent) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (!isMountedRef.current || savingRef.current) return;
      savingRef.current = true;
      try {
        await saveContent('auto');
      } catch {
        // Error already toasted by store
      } finally {
        savingRef.current = false;
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, savedContent, saveContent, delayMs, enabled, targetVersion]);
}

/**
 * Offers back unsaved text left from an earlier visit to this version, most
 * often one that ended at the login page after the session expired. The toast
 * stays until the reader answers: Restore puts the text in the editor as
 * unsaved changes (autosave then writes it), Discard throws it away. Closing
 * the toast without answering keeps the draft for the next visit.
 */
export function useDraftRestoreOffer() {
  const draftOffer = useEditorStore((s) => s.draftOffer);
  const restoreDraft = useEditorStore((s) => s.restoreDraft);
  const discardDraft = useEditorStore((s) => s.discardDraft);

  useEffect(() => {
    if (!draftOffer) return;
    const id = toast.warning('You have unsaved changes from your last visit.', {
      description: draftOffer.baseChanged
        ? 'This translation was changed since. Restoring replaces the current text with yours.'
        : 'Restore them to keep working where you left off.',
      duration: Infinity,
      action: { label: 'Restore', onClick: restoreDraft },
      cancel: { label: 'Discard', onClick: discardDraft },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [draftOffer, restoreDraft, discardDraft]);
}
