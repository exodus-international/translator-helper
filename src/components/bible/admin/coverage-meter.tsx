import { cn } from '@/lib/utils';
import { summarizeCoverage, type Coverage } from './bible-admin';

/**
 * Versification coverage of one translation as a single bar: reviewed books,
 * then declared-but-unchecked books, then the undeclared rest, which the
 * resolver refuses to answer for.
 */
export function CoverageMeter({
  coverage,
  role,
  className,
}: {
  coverage: Coverage;
  role: 'source' | 'target';
  className?: string;
}) {
  if (role === 'source') {
    return <span className={cn('text-xs text-muted-foreground', className)}>References are written against it</span>;
  }

  const s = summarizeCoverage(coverage);
  const declaredOnly = Math.max(0, s.declaredPercent - s.reviewedPercent);

  return (
    <div className={cn('flex min-w-40 flex-col gap-1', className)}>
      <div
        role="img"
        aria-label={s.label}
        title={s.label}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-success" style={{ width: `${s.reviewedPercent}%` }} />
        <div className="h-full bg-primary/50" style={{ width: `${declaredOnly}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums" aria-hidden="true">
        <span>
          {coverage.declaredBooks}/{coverage.presentBooks} declared
        </span>
        <span>{coverage.reviewedBooks} reviewed</span>
        {coverage.unmappableChapters > 0 && (
          <span className="text-warning">{coverage.unmappableChapters} unmappable ch.</span>
        )}
      </div>
    </div>
  );
}
