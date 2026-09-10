'use client';

import { cn } from '@/lib/utils';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { lintGutter, lintKeymap } from '@codemirror/lint';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  placeholder as placeholderExtension,
  type DecorationSet,
} from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { contentLinter, runFixAll, setLintContext } from '@/lib/lint/codemirror';
import type { LintDiagnostic } from '@/lib/lint';
import { lintDocument } from '@/lib/lint';
import { createEditorApi, offsetToPosition, type EditorApi } from './editor-api';
import { setSuggestions, suggestionExtension } from './cm-suggestions';
import { editorTheme } from './cm-theme';

const setHighlightLine = StateEffect.define<number | null>();

/** Language ids the panes actually ask for; anything else reads as Markdown. */
function languageSupport(language: string): Extension {
  if (language === 'yaml') return yaml();
  if (language === 'xml') return xml();
  return markdown();
}

/** Whole-line background on the line synced from the other pane. */
const highlightLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlightLine)) continue;
      const line = effect.value;
      if (line == null || line < 1 || line > transaction.state.doc.lines) {
        next = Decoration.none;
      } else {
        const target = transaction.state.doc.line(line);
        next = Decoration.set([Decoration.line({ class: 'synced-line-highlight' }).range(target.from)]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface CodeEditorHandle {
  /** Line/column API over the view — see editor-api. */
  editor: EditorApi | null;
  view: EditorView | null;
  /** Applies every safe lint fix; returns how many were applied. */
  fixAll(): { fixed: number; remaining: number };
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (lineNumber: number) => void;
  onSelectionChange?: (
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null,
  ) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  currentLine?: number;
  highlightLine?: number;
  language?: string;
  suggestions?: SuggestionWithUser[];
  onSuggestionClick?: (suggestion: SuggestionWithUser) => void;
  /** The English source, enabling the parity rules. Omit to lint style only. */
  sourceContent?: string;
  /** Fires whenever diagnostics change, for a status bar or badge. */
  onDiagnosticsChange?: (diagnostics: LintDiagnostic[]) => void;
  /** Rule ids to skip. */
  disabledRules?: string[];
  /** Turn linting off entirely — for panes showing content the reader can't edit. */
  lint?: boolean;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    value,
    onChange,
    onCursorChange,
    onSelectionChange,
    readOnly = false,
    placeholder,
    className,
    currentLine,
    highlightLine,
    language = 'markdown',
    suggestions = [],
    onSuggestionClick,
    sourceContent,
    onDiagnosticsChange,
    disabledRules,
    lint = true,
  },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [ready, setReady] = useState(false);

  // Callbacks live in refs: the extensions below are created once at mount, so
  // reading the prop directly would pin the first render's closure.
  const callbacks = useRef({ onChange, onCursorChange, onSelectionChange, onSuggestionClick, onDiagnosticsChange });
  callbacks.current = { onChange, onCursorChange, onSelectionChange, onSuggestionClick, onDiagnosticsChange };

  const languageCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;
  const lintCompartment = useRef(new Compartment()).current;
  const lintOptions = useRef({ disabled: disabledRules });
  lintOptions.current = { disabled: disabledRules };

  useEffect(() => {
    if (!hostRef.current) return;

    const languageExtension = languageSupport(language);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        callbacks.current.onChange?.(update.state.doc.toString());
        reportDiagnostics.current(update.state.doc.toString());
      }

      if (update.selectionSet) {
        const { main } = update.state.selection;
        // `update.docChanged` selection moves are echoes of our own edits, not
        // the translator navigating, so they must not move the other pane.
        if (!update.docChanged) {
          callbacks.current.onCursorChange?.(update.state.doc.lineAt(main.head).number);
        }
        if (main.empty) {
          callbacks.current.onSelectionChange?.(null);
        } else {
          const start = offsetToPosition(update.view, main.from);
          const end = offsetToPosition(update.view, main.to);
          callbacks.current.onSelectionChange?.({
            startLine: start.line,
            startColumn: start.column,
            endLine: end.line,
            endColumn: end.column,
          });
        }
      }
    });

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
      languageCompartment.of(languageExtension),
      readOnlyCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      placeholderCompartment.of(placeholder ? placeholderExtension(placeholder) : []),
      highlightLineField,
      suggestionExtension((suggestion) => callbacks.current.onSuggestionClick?.(suggestion)),
      lintCompartment.of(lint ? [contentLinter(lintOptions.current), lintGutter()] : []),
      EditorView.lineWrapping,
      editorTheme,
      updateListener,
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    setReady(true);

    return () => {
      view.destroy();
      viewRef.current = null;
      setReady(false);
    };
    // Mount once; every prop is pushed in through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceContentRef = useRef(sourceContent);
  sourceContentRef.current = sourceContent;
  const lintRef = useRef(lint);
  lintRef.current = lint;

  // Both the update listener and the effect below want to report diagnostics,
  // and for a controlled editor every keystroke reaches us twice — once as a
  // doc change, once as the value prop echoing back. Reporting is keyed on the
  // text and source that produced it, so the second call is a no-op.
  const lastReported = useRef<{ text: string; source?: string } | null>(null);
  const reportDiagnostics = useRef<(text: string) => void>(() => {});
  reportDiagnostics.current = (text: string) => {
    if (!onDiagnosticsChange) return;
    if (!lint) {
      lastReported.current = null;
      return;
    }
    const source = sourceContentRef.current;
    if (lastReported.current?.text === text && lastReported.current.source === source) return;
    lastReported.current = { text, source };
    onDiagnosticsChange(lintDocument({ text, source }, lintOptions.current));
  };

  // Controlled value: only write when the prop genuinely diverges, otherwise
  // every keystroke would round-trip and reset the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setLintContext.of({ source: sourceContent }) });
  }, [sourceContent]);

  // Diagnostics for a document nobody has typed in yet — on mount, and again
  // whenever the source it is compared against changes.
  useEffect(() => {
    const view = viewRef.current;
    if (view) reportDiagnostics.current(view.state.doc.toString());
  }, [ready, value, sourceContent, lint, disabledRules]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setSuggestions.of(suggestions) });
  }, [suggestions]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setHighlightLine.of(highlightLine ?? null) });
    if (highlightLine && viewRef.current) {
      const view = viewRef.current;
      const line = Math.min(Math.max(highlightLine, 1), view.state.doc.lines);
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) });
    }
  }, [highlightLine]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    });
  }, [readOnly, readOnlyCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(languageSupport(language)),
    });
  }, [language, languageCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartment.reconfigure(placeholder ? placeholderExtension(placeholder) : []),
    });
  }, [placeholder, placeholderCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lintCompartment.reconfigure(lint ? [contentLinter(lintOptions.current), lintGutter()] : []),
    });
  }, [lint, lintCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !currentLine) return;
    const line = Math.min(Math.max(currentLine, 1), view.state.doc.lines);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) });
    // Only on mount: later jumps come through highlightLine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Getters rather than captured values, so the handle stays correct across
  // mount and teardown without needing to be rebuilt when the view appears.
  useImperativeHandle(
    forwardedRef,
    () => ({
      get editor() {
        return viewRef.current ? createEditorApi(viewRef.current) : null;
      },
      get view() {
        return viewRef.current;
      },
      fixAll: () => (viewRef.current ? runFixAll(viewRef.current, lintOptions.current) : { fixed: 0, remaining: 0 }),
    }),
    [],
  );

  return <div ref={hostRef} className={cn('cm-host border-t overflow-hidden h-full', className)} />;
});
