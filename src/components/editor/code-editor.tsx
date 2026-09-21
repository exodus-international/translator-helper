'use client';

import { cn } from '@/lib/utils';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { lintGutter, lintKeymap } from '@codemirror/lint';
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
import { contentLinter, refreshLint, runFixAll, setLintContext } from '@/lib/lint/codemirror';
import type { LintDiagnostic, LintOptions } from '@/lib/lint';
import { lintDocument } from '@/lib/lint';
import { createEditorApi, offsetToPosition, type EditorApi } from './editor-api';
import { setSuggestions, suggestionExtension } from './cm-suggestions';
import { frontmatterDecoration } from './cm-frontmatter';
import { markdownSupport } from './cm-markdown';
import { editorHighlighting, editorTheme } from './cm-theme';

const setHighlightLine = StateEffect.define<number | null>();

/** Language ids the panes actually ask for; anything else reads as Markdown. */
function languageSupport(language: string): Extension {
  if (language === 'yaml') return yaml();
  if (language === 'xml') return xml();
  return markdownSupport;
}

/**
 * Whether the content rules have anything to say about this language.
 *
 * They are Markdown rules -- `*` for list items, typographic quotes, heading
 * parity against the source -- and these same panes open the library's `.yml`
 * files and the audio panel's SSML. There a "Fix all" rewrote every `- item`
 * of a sequence as `* item` and both quotes of a scalar as curly ones: both
 * are safe fixes, applied without asking, and the result is not YAML the
 * loader can read. Read off the language rather than asked of the caller,
 * because not one of the panes passes `lint` at all -- the default carried the
 * rules into every document the component is given. Compared against the
 * shared instance so this cannot fall out of step with the list above.
 */
function lintsAsMarkdown(language: string): boolean {
  return languageSupport(language) === markdownSupport;
}

/**
 * Read-only panes stay focusable.
 *
 * The source pane is read-only but still clickable -- a translator points at a
 * line to see its counterpart -- and CodeMirror only sets `contenteditable` on
 * an editable view, adding no tabindex of its own. So the pane's content DOM
 * could not take focus from a click: `.cm-focused` never landed and the theme,
 * which paints the active line only on a focused editor, left the clicked line
 * unmarked. The tabindex is the hook CodeMirror itself looks for on a
 * non-editable view, and it buys the cursor back without claiming to be an
 * editable box -- which `editable: true` would, down to a virtual keyboard on
 * a phone and a text field announced to a screen reader.
 */
function readOnlyExtensions(readOnly: boolean): Extension[] {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    readOnly ? EditorView.contentAttributes.of({ tabindex: '0' }) : [],
  ];
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

interface CodeEditorProps {
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
  /** This editor holds the English source itself: see `LintContext.isSource`. */
  isSource?: boolean;
  /** Fires whenever diagnostics change, for a status bar or badge. */
  onDiagnosticsChange?: (diagnostics: LintDiagnostic[]) => void;
  /** Rule ids to skip. */
  disabledRules?: string[];
  /** Turn linting off entirely — for panes showing content the reader can't edit. */
  lint?: boolean;
  /** Opens the Markdown guide from a lint finding, when the host offers one. */
  onOpenGuide?: () => void;
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
    isSource = false,
    onDiagnosticsChange,
    disabledRules,
    lint = true,
    onOpenGuide,
  },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [ready, setReady] = useState(false);

  // Callbacks live in refs: the extensions below are created once at mount, so
  // reading the prop directly would pin the first render's closure.
  const callbacks = useRef({
    onChange,
    onCursorChange,
    onSelectionChange,
    onSuggestionClick,
    onDiagnosticsChange,
    onOpenGuide,
  });
  callbacks.current = {
    onChange,
    onCursorChange,
    onSelectionChange,
    onSuggestionClick,
    onDiagnosticsChange,
    onOpenGuide,
  };

  const languageCompartment = useRef(new Compartment()).current;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;
  const lintCompartment = useRef(new Compartment()).current;
  // One object for the editor's whole life, mutated in place. `contentLinter`
  // captures it when the compartment is configured but reads `disabled` at
  // lint time, so replacing the object here would leave the linter holding the
  // rule set from the last reconfigure while the status bar moved on.
  const lintOptions = useRef<LintOptions>({ disabled: disabledRules });
  lintOptions.current.disabled = disabledRules;

  // Identity, not the array: callers build this list inline, so depending on
  // the array itself would re-run every effect below on every render.
  const disabledKey = (disabledRules ?? []).join('\u0000');

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
      // The app's own palette, and nothing under it: see cm-theme.
      editorHighlighting,
      keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap]),
      languageCompartment.of(languageExtension),
      readOnlyCompartment.of(readOnlyExtensions(readOnly)),
      placeholderCompartment.of(placeholder ? placeholderExtension(placeholder) : []),
      highlightLineField,
      suggestionExtension((suggestion) => callbacks.current.onSuggestionClick?.(suggestion)),
      lintCompartment.of(
        lintEnabled
          ? [contentLinter(lintOptions.current, { onOpenGuide: () => callbacks.current.onOpenGuide?.() }), lintGutter()]
          : [],
      ),
      EditorView.lineWrapping,
      frontmatterDecoration,
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
  const isSourceRef = useRef(isSource);
  isSourceRef.current = isSource;
  // The prop says whether this pane wants the rules; the language says whether
  // they mean anything here.
  const lintEnabled = lint && lintsAsMarkdown(language);
  const lintRef = useRef(lintEnabled);
  lintRef.current = lintEnabled;

  // Both the update listener and the effect below want to report diagnostics,
  // and for a controlled editor every keystroke reaches us twice — once as a
  // doc change, once as the value prop echoing back. Reporting is keyed on the
  // text and source that produced it, so the second call is a no-op.
  const lastReported = useRef<{ text: string; source?: string; isSource: boolean } | null>(null);
  const reportDiagnostics = useRef<(text: string) => void>(() => {});
  reportDiagnostics.current = (text: string) => {
    if (!onDiagnosticsChange) return;
    if (!lintEnabled) {
      lastReported.current = null;
      return;
    }
    const source = sourceContentRef.current;
    const isSource = isSourceRef.current;
    const last = lastReported.current;
    if (last?.text === text && last.source === source && last.isSource === isSource) return;
    lastReported.current = { text, source, isSource };
    onDiagnosticsChange(lintDocument({ text, source, isSource }, lintOptions.current));
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
    viewRef.current?.dispatch({ effects: setLintContext.of({ source: sourceContent, isSource }) });
  }, [sourceContent, isSource]);

  // Diagnostics for a document nobody has typed in yet — on mount, and again
  // whenever the source it is compared against changes.
  useEffect(() => {
    const view = viewRef.current;
    if (view) reportDiagnostics.current(view.state.doc.toString());
  }, [ready, value, sourceContent, isSource, lintEnabled, disabledKey]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setSuggestions.of(suggestions) });
  }, [suggestions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setHighlightLine.of(highlightLine ?? null) });
    // Only when it is out of sight. A pane kept in step with the other (see
    // scroll-sync) already shows the line level with its counterpart, and
    // centring it would undo that.
    if (highlightLine) createEditorApi(view).revealLineIfOutsideViewport(highlightLine);
  }, [highlightLine]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure(readOnlyExtensions(readOnly)),
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
      effects: lintCompartment.reconfigure(
        lintEnabled
          ? [contentLinter(lintOptions.current, { onOpenGuide: () => callbacks.current.onOpenGuide?.() }), lintGutter()]
          : [],
      ),
    });
  }, [lintEnabled, lintCompartment]);

  // Turning a rule off changes no text, so CodeMirror has no reason to lint
  // again on its own: without this the squiggles and gutter markers keep the
  // rule set they were drawn with while the status bar already reflects the new
  // one -- the bar and the editor disagreeing, indefinitely.
  useEffect(() => {
    const view = viewRef.current;
    if (view && lintEnabled) refreshLint(view);
  }, [disabledKey, lintEnabled, ready]);

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
      // Gated too: this is not the linter, it is a direct call, and the bar
      // that offers it is the host's to render.
      fixAll: () =>
        viewRef.current && lintRef.current
          ? runFixAll(viewRef.current, lintOptions.current)
          : { fixed: 0, remaining: 0 },
    }),
    [],
  );

  return <div ref={hostRef} className={cn('cm-host h-full overflow-hidden', className)} />;
});
