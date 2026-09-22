const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * When work is actually late. The date inputs send `yyyy-mm-dd`, which arrives
 * as midnight UTC at the *start* of the named day; a translator told "due the
 * 25th" has all of the 25th, so a bare date is due at the end of its day. A
 * deadline carrying a time of day is due at that time.
 */
export function effectiveDueAt(deadline: Date): Date {
  const isBareDate =
    deadline.getUTCHours() === 0 &&
    deadline.getUTCMinutes() === 0 &&
    deadline.getUTCSeconds() === 0 &&
    deadline.getUTCMilliseconds() === 0;
  return isBareDate ? new Date(deadline.getTime() + DAY) : deadline;
}

export type Reminder =
  | { kind: 'approaching'; window: '72h' | '24h' }
  | {
      kind: 'overdue';
      /** Whole days past due; 0 on the day it passes. */
      daysOverdue: number;
      /** Whether the assignee hears about it today. */
      remind: boolean;
      /** Whether managers hear about it today: on the assignee's reminder days, from a full day late on. */
      escalate: boolean;
    };

/**
 * What a deadline calls for right now. Only the most urgent approaching window
 * applies, so work assigned with a day left gets the one-day reminder and never
 * a stale three-day one. Overdue reminders thin out: the day it passes, the day
 * after, three days late, then weekly.
 */
export function reminderFor(now: Date, dueAt: Date): Reminder | null {
  const left = dueAt.getTime() - now.getTime();

  if (left > 72 * HOUR) return null;
  if (left > 24 * HOUR) return { kind: 'approaching', window: '72h' };
  if (left > 0) return { kind: 'approaching', window: '24h' };

  const daysOverdue = Math.floor((now.getTime() - dueAt.getTime()) / DAY);
  const remind = daysOverdue <= 1 || daysOverdue === 3 || daysOverdue % 7 === 0;
  return { kind: 'overdue', daysOverdue, remind, escalate: remind && daysOverdue >= 1 };
}

/** "Fri 25 Sept", in UTC: a bare date names a day, not an instant. */
export function formatDueDate(deadline: Date): string {
  return deadline.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
