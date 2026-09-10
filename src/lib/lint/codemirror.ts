'use client';

/**
 * Bridges the editor-agnostic rules in ./index to CodeMirror's lint extension.
 *
 * The source text a parity rule compares against lives in a StateField rather
 * than a closure, so the side-by-side viewer can push a new source document
 * without rebuilding the editor's extensions.
 */

import { linter, type Diagnostic, forceLinting } from '@codemirror/lint';
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { fixAll, lintDocument, type LintOptions } from './index';

interface LintContextValue {
  source?: string;
  filename?: string;
}

export const setLintContext = StateEffect.define<LintContextValue>();

const lintContextField = StateField.define<LintContextValue>({
  create: () => ({}),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLintContext)) return effect.value;
    }
    return value;
  },
});

function contextFor(state: EditorState): { text: string; source?: string; filename?: string } {
  const { source, filename } = state.field(lintContextField, false) ?? {};
  return { text: state.doc.toString(), source, filename };
}

/**
 * The lint extension. Diagnostics carry their fix as a CodeMirror action, so a
 * translator applies one from the tooltip; `runFixAll` applies every safe fix
 * at once.
 */
export function contentLinter(options: LintOptions = {}): Extension {
  return [
    lintContextField,
    linter(
      (view) =>
        lintDocument(contextFor(view.state), options).map((diagnostic): Diagnostic => {
          const fix = diagnostic.fix;
          return {
            from: diagnostic.from,
            to: Math.max(diagnostic.to, diagnostic.from),
            severity: diagnostic.severity,
            source: diagnostic.ruleId,
            message: diagnostic.message,
            actions: fix
              ? [
                  {
                    name: fix.title,
                    apply(target: EditorView) {
                      target.dispatch({ changes: fix.edits });
                    },
                  },
                ]
              : undefined,
          };
        }),
      { delay: 300 },
    ),
  ];
}

export interface FixAllOutcome {
  fixed: number;
  remaining: number;
}

/** Applies every safe fix as a single undoable transaction. */
export function runFixAll(view: EditorView, options: LintOptions = {}): FixAllOutcome {
  const context = contextFor(view.state);
  const result = fixAll(context, options);

  if (result.text !== context.text) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.text },
      // Keep the caret where the translator left it rather than jumping to 0.
      selection: { anchor: Math.min(view.state.selection.main.anchor, result.text.length) },
    });
    forceLinting(view);
  }

  return { fixed: result.fixed, remaining: result.remaining.length };
}

/** Pushes a new source document (or filename) into a mounted editor. */
export function updateLintContext(view: EditorView, value: LintContextValue): void {
  view.dispatch({ effects: setLintContext.of(value) });
  forceLinting(view);
}

/** Current diagnostics without waiting for the debounce — for a status bar. */
export function currentDiagnostics(state: EditorState, options: LintOptions = {}) {
  return lintDocument(contextFor(state), options);
}
