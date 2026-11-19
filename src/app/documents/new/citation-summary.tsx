'use client';

import { checkReferences } from '@/components/editor/scripture-client';
import type { PassageStatus, ReferenceCheck } from '@/domain/bible/bible.types';
import { findCitations } from '@/domain/scripture/citations';
import { NOT_A_REFERENCE, STATUS_LABEL } from '@/domain/scripture/scripture-check';
import { cn } from '@/lib/utils';
import { BookMarked, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const CHECK_DELAY_MS = 700;

/** The order problems are listed in: the ones a typo explains first. */
const PROBLEM_ORDER: PassageStatus[] = [
  'unknown_book',
  'out_of_range',
  'book_not_in_translation',
  'versification_unmapped',
  'unknown_language',
  'unparseable',
];

interface Summary {
  key: string;
  checks: ReferenceCheck[];
  failed: boolean;
}

/**
 * The Bible citations in a document about to be created, checked against
 * RSV-CE: which resolve, and which do not and why. It only informs; the
 * document is created either way.
 */
export function CitationSummary({
  content,
  className,
  check = checkReferences,
}: {
  content: string;
  className?: string;
  /** How the references are checked; the Bible's own check unless a test gives another. */
  check?: (refs: string[]) => Promise<Map<string, ReferenceCheck>>;
}) {
  const refs = useMemo(() => [...new Set(findCitations(content).map((c) => c.text))], [content]);
  const key = refs.join('\u0000');
  const [summary, setSummary] = useState<Summary>();

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const list = key.split('\u0000');
    const timer = setTimeout(() => {
      check(list).then(
        (found) => {
          if (cancelled) return;
          const checks = list.flatMap((ref) => (found.has(ref) ? [found.get(ref)!] : []));
          setSummary({ key, checks, failed: checks.length === 0 });
        },
        () => !cancelled && setSummary({ key, checks: [], failed: true }),
      );
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, check]);

  if (!key) return null;
  const current = summary?.key === key ? summary : undefined;

  const checks = current?.checks ?? [];
  const resolved = checks.filter((c) => c.status === 'ok' || c.status === 'partial');
  const problems = checks.filter((c) => c.status !== 'ok' && c.status !== 'partial' && c.status !== 'unparseable');
  const groups = PROBLEM_ORDER.map((status) => ({ status, refs: problems.filter((c) => c.status === status) })).filter(
    (g) => g.refs.length > 0,
  );

  if (current && !current.failed && checks.length === 0) return null;

  return (
    <div
      className={cn('flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs', className)}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {current ? <BookMarked className="size-3.5 shrink-0" /> : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
        <span className="min-w-0 flex-1">
          {!current
            ? 'Checking Bible citations…'
            : current.failed
              ? 'The Bible citations could not be checked right now. You can still create the document.'
              : problems.length === 0
                ? `${resolved.length} Bible ${resolved.length === 1 ? 'citation' : 'citations'}, all found in RSV-CE.`
                : `${checks.length} Bible ${checks.length === 1 ? 'citation' : 'citations'}: ${resolved.length} found in RSV-CE, ${problems.length} not.`}
        </span>
      </div>

      {resolved.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Citations found">
          {resolved.map((c) => (
            <li
              key={c.ref}
              title={c.normalized && c.normalized !== c.ref ? `Written as ${c.ref}` : undefined}
              className="rounded-md border bg-background px-1.5 py-0.5 text-foreground"
            >
              {c.normalized ?? c.ref}
              {c.status === 'partial' && <span className="text-warning"> (part)</span>}
            </li>
          ))}
        </ul>
      )}

      {groups.map((group) => (
        <div key={group.status} className="flex flex-col gap-0.5">
          <span className="font-medium text-warning">{STATUS_LABEL[group.status]}</span>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {group.refs.map((c) => (
              <li key={c.ref}>
                <span className="text-foreground">{c.ref}</span>
                {c.notes[0] && !NOT_A_REFERENCE.has(c.status) ? <span>: {c.notes[0]}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
