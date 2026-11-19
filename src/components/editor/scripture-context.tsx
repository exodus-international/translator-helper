'use client';

import type { EditorView } from '@codemirror/view';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import type { PassageResult } from '@/domain/bible/bible.types';
import { citationKey, findCitations } from '@/domain/scripture/citations';
import { isResolved } from '@/domain/scripture/scripture-check';
import { bibleForLanguage, resolvePassages } from './scripture-client';

/**
 * What the Scripture tools in a translation editor share: the document's
 * language and its Bible, the source's citations as that Bible renders them,
 * and the translation's editor view, through which every change is made so it
 * is undoable and marks the document unsaved like typing does.
 *
 * Without a provider there are no Scripture tools: the editor and the panel
 * read `null` and render nothing extra, so every other use of them is as it was.
 */
export interface ScriptureHost {
  language: string;
  languageName: string | null;
  /** `undefined` while it loads, `null` when the language has none. */
  bible: BibleTranslationDto | null | undefined;
  /** The Bible could not be read. */
  bibleError: boolean;
  /** What the resolver is asked for: the Bible's code once known. */
  translation: string;
  /** The source's citations, resolved, by citation as written in the source. */
  sourcePassages: ReadonlyMap<string, PassageResult>;
  /** The same, by `citationKey` of the target rendering. */
  sourceRendered: ReadonlyMap<string, PassageResult>;
  /** The translation's editor, while one is mounted. */
  view: EditorView | null;
  /** Called by the translation editor; returns the call that unregisters it. */
  registerView: (view: EditorView) => () => void;
  /** Brings the translation editor on screen (from Preview, say). */
  requestEditor?: () => void;
  /** Whether the panel may change the text; false leaves it checking and pointing only. */
  editable: boolean;
}

const ScriptureContext = createContext<ScriptureHost | null>(null);

export function useScriptureHost(): ScriptureHost | null {
  return useContext(ScriptureContext);
}

const EMPTY = new Map<string, PassageResult>();

export function ScriptureProvider({
  languageCode,
  languageName = null,
  sourceContent,
  requestEditor,
  editable = true,
  children,
}: {
  languageCode?: string | null;
  languageName?: string | null;
  sourceContent: string;
  requestEditor?: () => void;
  editable?: boolean;
  children: ReactNode;
}) {
  const language = languageCode?.toLowerCase() ?? '';
  const [bibleState, setBibleState] = useState<{ language: string; bible: BibleTranslationDto | null; error: boolean }>();
  const [view, setView] = useState<EditorView | null>(null);
  const [sourceState, setSourceState] = useState<{ key: string; passages: Map<string, PassageResult> }>();

  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    bibleForLanguage(language).then(
      (bible) => !cancelled && setBibleState({ language, bible, error: false }),
      () => !cancelled && setBibleState({ language, bible: null, error: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [language]);

  const bible = bibleState?.language === language ? bibleState.bible : undefined;
  const translation = bible?.code ?? language;
  const sourceKey = `${translation}\u0000${sourceContent}`;

  useEffect(() => {
    if (!bible) return;
    const refs = [...new Set(findCitations(sourceContent).map((c) => c.text))];
    let cancelled = false;
    resolvePassages(refs, bible.code).then((passages) => {
      if (!cancelled) setSourceState({ key: `${bible.code}\u0000${sourceContent}`, passages });
    });
    return () => {
      cancelled = true;
    };
  }, [bible, sourceContent]);

  const sourcePassages = sourceState?.key === sourceKey ? sourceState.passages : EMPTY;
  const sourceRendered = useMemo(() => {
    const out = new Map<string, PassageResult>();
    for (const result of sourcePassages.values()) {
      if (isResolved(result)) out.set(citationKey(result.rendered), result);
    }
    return out;
  }, [sourcePassages]);

  const registerView = useCallback((next: EditorView) => {
    setView(next);
    return () => setView((current) => (current === next ? null : current));
  }, []);

  const value = useMemo<ScriptureHost>(
    () => ({
      language,
      languageName,
      bible,
      bibleError: bibleState?.language === language && bibleState.error,
      translation,
      sourcePassages,
      sourceRendered,
      view,
      registerView,
      requestEditor,
      editable,
    }),
    [language, languageName, bible, bibleState, translation, sourcePassages, sourceRendered, view, registerView, requestEditor, editable],
  );

  if (!language) return <>{children}</>;
  return <ScriptureContext.Provider value={value}>{children}</ScriptureContext.Provider>;
}

/** For tests and stories: a host with everything settled. */
export function StaticScriptureProvider({ host, children }: { host: ScriptureHost; children: ReactNode }) {
  return <ScriptureContext.Provider value={host}>{children}</ScriptureContext.Provider>;
}
