'use client';

import type { EditorView } from '@codemirror/view';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import type { PassageResult } from '@/domain/bible/bible.types';
import { citationKey, findCitations, isVerseTag, untaggedReading } from '@/domain/scripture/citations';
import { isResolved } from '@/domain/scripture/scripture-check';
import { bibleForLanguage, identifyReading, resolvePassage, resolvePassages } from './scripture-client';

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
  /**
   * The source's day reading in the target Bible: its `verse_tag` passage, or,
   * when it has none, the passage its reading's text was found as. Null when
   * there is none or it could not be found.
   */
  sourceReading: PassageResult | null;
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
  const [sourceState, setSourceState] = useState<{
    key: string;
    passages: Map<string, PassageResult>;
    reading: PassageResult | null;
  }>();

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
    const citations = findCitations(sourceContent);
    const refs = [...new Set(citations.map((c) => c.text))];
    const tag = citations.find((c) => isVerseTag(sourceContent, c));
    const untagged = tag ? null : untaggedReading(sourceContent);
    let cancelled = false;
    (async () => {
      const passages = await resolvePassages(refs, bible.code);
      let reading = tag ? (passages.get(tag.text) ?? null) : null;
      if (untagged) {
        // A day with no verse_tag: its reading is found by its text, as the AI translation does.
        const ref = await identifyReading(untagged.text).catch(() => null);
        reading = ref ? ((await resolvePassage(ref, bible.code)) ?? null) : null;
      }
      if (!cancelled) setSourceState({ key: `${bible.code}\u0000${sourceContent}`, passages, reading });
    })();
    return () => {
      cancelled = true;
    };
  }, [bible, sourceContent]);

  const sourcePassages = sourceState?.key === sourceKey ? sourceState.passages : EMPTY;
  const sourceReading = sourceState?.key === sourceKey ? sourceState.reading : null;
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
      sourceReading,
      view,
      registerView,
      requestEditor,
      editable,
    }),
    [language, languageName, bible, bibleState, translation, sourcePassages, sourceRendered, sourceReading, view, registerView, requestEditor, editable],
  );

  if (!language) return <>{children}</>;
  return <ScriptureContext.Provider value={value}>{children}</ScriptureContext.Provider>;
}
