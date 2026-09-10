'use client';

import { cn } from '@/lib/utils';
import { isSafelyFixable, type LintDiagnostic } from '@/lib/lint';

/**
 * Sits under the editor and reports what the content lint found, with one
 * button that applies every fix that cannot change meaning. Fixes the rules
 * mark unsafe — restoring a link URL the translator deliberately swapped, say
 * — stay out of this and are accepted one at a time from the gutter.
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

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {diagnostics.length === 0 ? (
          <span className="text-green-700">No content issues</span>
        ) : (
          <>
            {errors > 0 && <Count className="text-red-600" value={errors} label="error" />}
            {warnings > 0 && <Count className="text-amber-600" value={warnings} label="warning" />}
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
