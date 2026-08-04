// Date formatting for the UI. Formatters are hoisted to module level because
// constructing Intl.DateTimeFormat is expensive and these run per table row.
// All use the viewer's locale with a spelled-out month, so day and month can
// never be confused regardless of whether the browser is set to en-US or cs-CZ.

const unambiguousDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const exactDateTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formats a date with a spelled-out month ("12 Jun 2026") in the viewer's locale. */
export function formatUnambiguousDate(value: Date | string): string {
  return unambiguousDate.format(new Date(value));
}

/** Formats a full timestamp ("12 Jun 2026, 14:30") in the viewer's locale. */
export function formatExactDateTime(value: Date | string): string {
  return exactDateTime.format(new Date(value));
}

/**
 * Formats a "last activity" timestamp: relative for the recent past ("today",
 * "yesterday", "N days ago"), an unambiguous date beyond 30 days, and an em
 * dash when there is no activity at all.
 */
export function formatLastActive(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '—';
  const date = new Date(value);
  const days = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 30) return `${days} days ago`;
  return formatUnambiguousDate(date);
}
