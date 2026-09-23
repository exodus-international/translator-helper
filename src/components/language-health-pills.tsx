import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LanguageHealthPill } from '@/domain/language/language-health';

/**
 * The same verdict on the index and on the settings page, so the screen an
 * admin fixes a language on carries the words the screen that sent them there
 * used. A healthy check stays quiet: only a failure earns colour.
 */
export function LanguageHealthPills({ pills, className }: { pills: LanguageHealthPill[]; className?: string }) {
  if (pills.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {pills.map((pill) => (
        <span
          key={pill.key}
          className={cn(
            // Wraps rather than truncates: the consequence beside the label is
            // the point of the pill, and at phone width truncation would cut
            // exactly the half that says what breaks.
            'inline-flex max-w-full items-start gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] leading-4',
            pill.state === 'ok'
              ? 'border-border bg-muted/50 text-muted-foreground'
              : 'border-warning/40 bg-warning/10 text-warning font-medium',
          )}
        >
          {pill.state === 'ok' ? (
            <Check className="text-success mt-0.5 size-3 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          )}
          <span className="min-w-0">
            {pill.label}
            {pill.detail && <span className="font-normal"> — {pill.detail}</span>}
          </span>
        </span>
      ))}
    </div>
  );
}
