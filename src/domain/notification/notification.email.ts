import { DigestEmail } from '@/emails/notification-digest';
import type { NotificationType } from '@/generated/prisma/enums';
import { render } from '@react-email/components';
import { createElement } from 'react';
import { NOTIFICATION_CATALOG, TONE_ORDER } from './notification.catalog';

const HOUR = 60 * 60 * 1000;

/**
 * Email goes out once a day, at noon Central European Time, as one digest per
 * person. The zone follows the clocks (CET in winter, CEST in summer), so the
 * digest always lands at 12:00 on the team's wall clock.
 */
const DIGEST_TIME_ZONE = 'Europe/Zagreb';
const DIGEST_HOUR = 12;
/** Unsent notifications older than this are dropped rather than emailed a day late. */
/** Resend's free tier allows 100 emails a day; no one run may use them all. */
export const EMAILS_PER_RUN = 25;
export const EMAIL_MAX_AGE = 36 * HOUR;

/** How far `timeZone`'s wall clock is ahead of UTC at `date`. */
function zoneOffset(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const wallClock = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wallClock - Math.floor(date.getTime() / 1000) * 1000;
}

/** The latest digest time at or before `now`: today's noon, or yesterday's if it is still morning. */
export function lastDigestTime(now: Date): Date {
  const local = new Date(now.getTime() + zoneOffset(now, DIGEST_TIME_ZONE));
  const noonOn = (dayOffset: number) => {
    const wallNoon = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, DIGEST_HOUR);
    // Clocks change at night, so the offset at noon is the offset all afternoon.
    return new Date(wallNoon - zoneOffset(new Date(wallNoon), DIGEST_TIME_ZONE));
  };
  const today = noonOn(0);
  return today <= now ? today : noonOn(-1);
}

/**
 * Whether a person's pending notifications should be emailed now: once
 * anything of theirs was waiting at the last noon. What arrives after noon
 * waits for the next one, so nobody gets more than one digest a day, and a
 * send that failed is simply retried by the next sweep.
 */
export function isDigestDue(createdAts: Date[], now: Date): boolean {
  const slot = lastDigestTime(now);
  return createdAts.some((createdAt) => createdAt <= slot);
}

export interface DigestItem {
  type: NotificationType;
  title: string;
  body: string | null;
  url: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function absolute(appUrl: string, path: string): string {
  return new URL(path, appUrl).toString();
}

const HEADER_PATH = '/email/header.jpg';

/**
 * One email for everything that is waiting for one person, loudest first. A
 * single item gets its own title as the subject, so the inbox reads like the
 * notification. The layout is `src/emails/notification-digest.tsx`.
 */
export async function renderDigestEmail(
  recipientName: string,
  items: DigestItem[],
  appUrl: string,
): Promise<RenderedEmail> {
  const sorted = items
    .map((item, index) => ({ item, index, rank: TONE_ORDER.indexOf(NOTIFICATION_CATALOG[item.type].tone) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
  const overdue = items.filter((item) => NOTIFICATION_CATALOG[item.type].tone === 'overdue').length;
  const soon = items.filter((item) => NOTIFICATION_CATALOG[item.type].tone === 'soon').length;

  const urgency = [overdue ? `${overdue} overdue` : null, soon ? `${soon} due soon` : null].filter(Boolean).join(', ');
  const subject =
    items.length === 1
      ? items[0].title
      : `${items.length} updates in Translation Helper${urgency ? ` (${urgency})` : ''}`;
  const preferencesUrl = absolute(appUrl, '/profile#notifications');
  const firstName = recipientName.split(' ')[0] || recipientName;
  const greeting = `Hi ${firstName},`;
  const intro = introFor(items.length, overdue, soon);

  const html = await render(
    createElement(DigestEmail, {
      subject,
      greeting,
      intro,
      cards: sorted.map((item) => ({ ...item, href: item.url ? absolute(appUrl, item.url) : null })),
      headerUrl: absolute(appUrl, HEADER_PATH),
      preferencesUrl,
    }),
  );

  const textItems = sorted
    .map((item) =>
      [
        `- [${NOTIFICATION_CATALOG[item.type].tag.toUpperCase()}] ${item.title}`,
        item.body ? `  ${item.body}` : null,
        item.url ? `  ${absolute(appUrl, item.url)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  const text = `${greeting}\n\n${intro}\n\n${textItems}\n\n--\nTranslation Helper, Exodus 90\nChoose which emails you get: ${preferencesUrl}\n`;

  return { subject, html, text };
}

function introFor(count: number, overdue: number, soon: number): string {
  if (overdue && count === overdue)
    return overdue === 1 ? 'A deadline has passed.' : `${overdue} deadlines have passed.`;
  if (soon && count === soon) return soon === 1 ? 'A deadline is coming up.' : `${soon} deadlines are coming up.`;
  const base = count === 1 ? 'There is an update on your work' : `There are ${count} updates on your work`;
  if (overdue) return `${base}, and ${overdue === 1 ? 'one deadline has' : `${overdue} deadlines have`} passed.`;
  if (soon) return `${base}, and ${soon === 1 ? 'one deadline is' : `${soon} deadlines are`} coming up.`;
  return `${base}.`;
}
