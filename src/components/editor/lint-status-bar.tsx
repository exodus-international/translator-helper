'use client';

import { cn } from '@/lib/utils';
import { isSafelyFixable, type LintDiagnostic, type LintSeverity } from '@/lib/lint';
import { AlertCircle, AlertTriangle, Info, type LucideIcon } from 'lucide-react';

const SEVERITY_ICON: Record<LintSeverity, LucideIcon> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_TEXT_CLASS: Record<LintSeverity, string> = {
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-muted-foreground',
};

/**
 * Sits under the editor and reports what the content lint found, with one
 * button that applies every fix that cannot change meaning. Fixes the rules
 * mark unsafe — restoring a link URL the translator deliberately swapped, say
 * — stay out of this and are accepted one at a time from the gutter.
 *
 * Findings the rules mark as document-wide (a heading or link count that no
 * longer matches the source) have no line of their own to point at, so they are
 * written out above the counts instead of being pinned to line 1, where they
 * read as a problem with whatever happened to be there.
 */
export function LintStatusBar({
  diagnostics,
  onFixAll,
  className,
}: {
  diagnostics: LintDiagnostic[];
  onFixAll: () => void;
  className?: string;
}) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const infos = diagnostics.length - errors - warnings;
  const fixable = diagnostics.filter(isSafelyFixable).length;
  const documentFindings = diagnostics.filter((d) => d.scope === 'document');

  return (
    <div className={cn('border-t bg-muted/40 text-[11px] text-muted-foreground', className)}>
      {documentFindings.length > 0 && (
        <ul className="flex flex-col gap-0.5 px-2 pt-1">
          {documentFindings.map((finding, index) => {
            const Icon = SEVERITY_ICON[finding.severity];
            return (
              <li
                key={`${finding.ruleId}-${index}`}
                className="flex min-w-0 items-center gap-1.5"
                title={finding.message}
              >
                <Icon className={cn('size-3 shrink-0', SEVERITY_TEXT_CLASS[finding.severity])} />
                <span className="truncate">{finding.message}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="flex items-center gap-3">
          {diagnostics.length === 0 ? (
            <span className="text-success">No content issues</span>
          ) : (
            <>
              {errors > 0 && <Count className="text-destructive" value={errors} label="error" />}
              {warnings > 0 && <Count className="text-warning" value={warnings} label="warning" />}
              {infos > 0 && <Count value={infos} label="suggestion" />}
            </>
          )}
        </div>
        {fixable > 0 && (
          <button
            type="button"
            onClick={onFixAll}
            className="rounded border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-muted"
            title="Applies every fix that cannot change meaning — whitespace, quotes, list markers, untranslatable frontmatter keys. Anything that could overrule an editorial choice stays for you to accept from the gutter."
          >
            Fix all {fixable}
          </button>
        )}
      </div>
    </div>
  );
}

function Count({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span className={className}>
      {value} {label}
      {value === 1 ? '' : 's'}
    </span>
  );
}
