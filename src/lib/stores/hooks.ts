'use client';

import { useEffect, useRef } from 'react';
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
        await saveContent();
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
