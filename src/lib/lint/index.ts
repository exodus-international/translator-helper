/**
 * Content linting for translated Exodus 90 documents.
 *
 * The engine is deliberately editor-agnostic: rules take text in and return
 * offset-based diagnostics, so the same rules back the CodeMirror gutter, a
 * pre-publish server check, and the test suite. Nothing here imports an editor.
 */

import type { LintContext, LintDiagnostic, LintEdit, LintRule } from './types';
import { houseStyleRules } from './rules/house-style';
import { parityRules } from './rules/parity';

export * from './types';
export { KNOWN_FRONTMATTER_KEYS, NON_TRANSLATABLE_KEYS } from './rules/parity';

export const allRules: LintRule[] = [...parityRules, ...houseStyleRules];

export interface LintOptions {
  rules?: LintRule[];
  /** Rule ids to skip, e.g. from a per-project settings row. */
  disabled?: string[];
}

export function lintDocument(context: LintContext, options: LintOptions = {}): LintDiagnostic[] {
  const { rules = allRules, disabled = [] } = options;
  const diagnostics: LintDiagnostic[] = [];

  for (const rule of rules) {
    if (disabled.includes(rule.id)) continue;
    if (rule.requiresSource && !context.source) continue;
    try {
      diagnostics.push(...rule.check(context));
    } catch {
      // A rule that throws must not take down the editor's lint pass.
      continue;
    }
  }

  return diagnostics.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Applies `edits` to `text`. Edits are applied right-to-left so earlier offsets
 * stay valid without remapping. An edit that overlaps one already applied is
 * skipped, which means the rightmost of two conflicting edits wins — arbitrary
 * but deterministic, and `fixAll` re-lints afterwards so the loser gets another
 * pass on the next iteration.
 */
export function applyEdits(text: string, edits: LintEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);
  let result = text;
  let lastFrom = Number.POSITIVE_INFINITY;

  for (const edit of ordered) {
    if (edit.to > lastFrom) continue; // overlaps an edit already applied
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
    lastFrom = edit.from;
  }
  return result;
}

/** Whether `fixAll` would apply this diagnostic's fix without being asked. */
export function isSafelyFixable(diagnostic: LintDiagnostic): boolean {
  return Boolean(diagnostic.fix) && diagnostic.fix!.safe !== false;
}

export interface FixAllResult {
  text: string;
  /** Number of diagnostics resolved. */
  fixed: number;
  /** Diagnostics that remain — either unfixable or needing a human. */
  remaining: LintDiagnostic[];
}

/**
 * Repeatedly lints and applies every *safe* fix until the document stops
 * changing. Iterating matters because one fix can expose another: stripping
 * trailing whitespace off the last line is what makes `final-newline` fire.
 *
 * Fixes marked `safe: false` are skipped here and left in `remaining` for the
 * translator to accept individually.
 */
export function fixAll(context: LintContext, options: LintOptions = {}): FixAllResult {
  const MAX_PASSES = 10;
  let text = context.text;
  let fixed = 0;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const diagnostics = lintDocument({ ...context, text }, options);
    const fixable = diagnostics.filter(isSafelyFixable);
    if (fixable.length === 0) break;

    const next = applyEdits(
      text,
      fixable.flatMap((d) => d.fix!.edits),
    );
    if (next === text) break;

    fixed += fixable.length;
    text = next;
  }

  return { text, fixed, remaining: lintDocument({ ...context, text }, options) };
}
