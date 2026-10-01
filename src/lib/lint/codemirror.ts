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
import { fixAll, lintDocument, type LintContext, type LintOptions } from './index';

interface LintContextValue {
  source?: string;
  filename?: string;
  isSource?: boolean;
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

function contextFor(state: EditorState): LintContext {
  const { source, filename, isSource } = state.field(lintContextField, false) ?? {};
  return { text: state.doc.toString(), source, filename, isSource };
}

/**
 * The lint extension. Diagnostics carry their fix as a CodeMirror action, so a
 * translator applies one from the tooltip; `runFixAll` applies every safe fix
 * at once. Each one also carries a way into the Markdown guide, because the
 * rules and the guide explain the same contract.
 */
export function contentLinter(options: LintOptions = {}, hooks: { onOpenGuide?: () => void } = {}): Extension {
  return [
    lintContextField,
    linter(
      (view) =>
        lintDocument(contextFor(view.state), options)
          // Document-wide findings have no range to underline; drawing them
          // pinned an error marker to line 1, which read as a problem with that
          // line. The status bar reports them instead.
          .filter((diagnostic) => diagnostic.scope !== 'document')
          .map((diagnostic): Diagnostic => {
            const fix = diagnostic.fix;
            return {
              from: diagnostic.from,
              to: Math.max(diagnostic.to, diagnostic.from),
              severity: diagnostic.severity,
              source: diagnostic.ruleId,
              message: diagnostic.message,
              actions: [
                ...(fix
                  ? [
                      {
                        name: fix.title,
                        apply(target: EditorView, from: number, to: number) {
                          // Look the finding up again rather than replaying
                          // `fix.edits`. Those offsets belong to the document
                          // this pass read, and an action outlives that
                          // document: CodeMirror maps the diagnostic through
                          // every change and keeps the panel open across them,
                          // which is why it hands the action the finding's
                          // *current* range. The edits were left behind
                          // unmapped, so a quick fix clicked after a few
                          // keystrokes cut the document where the finding used
                          // to be -- rewriting or deleting text the rule had
                          // nothing to say about.
                          const fresh = lintDocument(contextFor(target.state), options).find(
                            (candidate) =>
                              candidate.fix !== undefined &&
                              candidate.ruleId === diagnostic.ruleId &&
                              candidate.from === from &&
                              Math.max(candidate.to, candidate.from) === to,
                          );
                          // Gone or moved further than the mapping accounts
                          // for: there is no edit that can be trusted, so ask
                          // for a pass and let the tooltip redraw from it.
                          if (!fresh?.fix) {
                            forceLinting(target);
                            return;
                          }
                          target.dispatch({ changes: fresh.fix.edits });
                        },
                      },
                    ]
                  : []),
                ...(hooks.onOpenGuide
                  ? [
                      {
                        name: 'Markdown guide',
                        markClass: 'cm-guide-action',
                        apply: () => hooks.onOpenGuide?.(),
                      },
                    ]
                  : []),
              ],
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

/**
 * Asks a mounted editor to lint again.
 *
 * `contentLinter` reads its options at lint time, so a changed rule set is
 * picked up without rebuilding the extension -- but nothing would ask for a
 * new pass, since toggling a rule changes no text.
 */
export function refreshLint(view: EditorView): void {
  forceLinting(view);
}
