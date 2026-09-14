/**
 * Editor-agnostic lint types for Exodus 90 content documents.
 *
 * Offsets are absolute indices into the document text (not line/column), which
 * is what CodeMirror's diagnostic and change APIs speak natively. Consumers
 * that think in line/column convert via `offsetToPosition` in the editor API.
 */

export type LintSeverity = 'error' | 'warning' | 'info';

/** A single text replacement. `from`/`to` are absolute offsets, `to` exclusive. */
export interface LintEdit {
  from: number;
  to: number;
  insert: string;
}

export interface LintFix {
  /** Shown in the editor's quick-fix menu, e.g. 'Restore hero slug'. */
  title: string;
  edits: LintEdit[];
  /**
   * Whether "fix all" may apply this without asking. Defaults to true.
   *
   * Marked false where reverting to the source would overrule a legitimate
   * editorial choice — a translator swapping an English article for a
   * same-language equivalent, say. Unsafe fixes still appear in the editor's
   * quick-fix menu; they are just never applied in bulk.
   */
  safe?: boolean;
}

export interface LintDiagnostic {
  ruleId: string;
  severity: LintSeverity;
  message: string;
  from: number;
  to: number;
  fix?: LintFix;
}

export interface LintContext {
  /** The document being linted (the translation). */
  text: string;
  /**
   * The English source for the same document, when available. Rules that
   * compare the two declare `requiresSource` and are skipped without it.
   */
  source?: string;
  /** e.g. '20260302-2.md' — used by rules that key off the document type. */
  filename?: string;
}

export interface LintRule {
  id: string;
  severity: LintSeverity;
  /** One line, shown in the rule settings UI. */
  description: string;
  /** When true the rule only runs if `context.source` is set. */
  requiresSource?: boolean;
  check(context: LintContext): LintDiagnostic[];
}
