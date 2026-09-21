import { DocumentStatus, type NotificationType } from '@/generated/prisma/enums';
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absolute(appUrl: string, path: string): string {
  return new URL(path, appUrl).toString();
}

/**
 * The Exodus 90 frame (black header, logo, orange accent) around content that
 * looks like the app: its neutrals, its font and its chips. Email clients know
 * nothing of oklch or CSS variables, so these are the light theme's tokens
 * (src/app/globals.css) written out as hex.
 */
const BRAND = {
  orange: '#FF4800',
  black: '#171618',
  white: '#FFFFFF',
  display: "'Clash Display','Helvetica Neue',Helvetica,Arial,sans-serif",
};
const APP = {
  foreground: '#0A0A0A',
  primary: '#171717',
  mutedForeground: '#737373',
  muted: '#F5F5F5',
  border: '#E5E5E5',
  canvas: '#FAFAFA',
  radius: '10px',
  font: "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
};

interface Chip {
  /** The label and icon colour: the token itself. */
  text: string;
  /** The token at 10% on white, like bg-hue-blue/10. */
  fill: string;
  /** The token at 25% on white, like border-hue-blue/25. */
  border: string;
}

const NEUTRAL_CHIP: Chip = { text: APP.mutedForeground, fill: APP.muted, border: APP.border };
const DESTRUCTIVE_CHIP: Chip = { text: '#E7000B', fill: '#FDE6E7', border: '#F9BFC2' };
const WARNING_CHIP: Chip = { text: '#A76200', fill: '#F6EFE6', border: '#E9D8BF' };

/** The document status badges (src/constants/document-status.ts), by their --hue-* token. */
const STATUS_CHIPS: Partial<Record<DocumentStatus, Chip>> = {
  [DocumentStatus.IN_PROGRESS]: { text: '#0061D8', fill: '#E6EFFB', border: '#BFD8F5' },
  [DocumentStatus.PENDING_REVIEW]: WARNING_CHIP,
  [DocumentStatus.APPROVED]: { text: '#008954', fill: '#E6F3EE', border: '#BFE2D4' },
};

/** The same chip the app shows for the notification: deadlines, then the status it is about. */
function chipFor(type: NotificationType): Chip {
  const { tone, status } = NOTIFICATION_CATALOG[type];
  if (tone === 'overdue') return DESTRUCTIVE_CHIP;
  if (tone === 'soon') return WARNING_CHIP;
  return (status && STATUS_CHIPS[status]) || NEUTRAL_CHIP;
}

/** 480 × 136, shown at a third of that so it stays sharp on high-density screens. */
const LOGO_PATH = '/email/exodus90-white-orange.png';

/**
 * One email for everything that is waiting for one person. A single item gets
 * its own title as the subject, so the inbox reads like the notification.
 *
 * Email clients understand only tables and inline styles, and most ignore web
 * fonts, so every font has a system fallback and the layout never depends on
 * CSS a client may strip.
 */
export function renderDigestEmail(recipientName: string, items: DigestItem[], appUrl: string): RenderedEmail {
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
  const preheader = sorted.map((item) => item.title).join(' · ');

  const htmlItems = sorted.map((item) => renderItem(item, appUrl)).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${APP.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${APP.canvas}">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${APP.canvas}" style="background:${APP.canvas}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td align="center" bgcolor="${BRAND.black}" style="background:${BRAND.black};padding:36px 32px 28px">
<img src="${escapeHtml(absolute(appUrl, LOGO_PATH))}" width="160" height="45" alt="Exodus 90" style="display:block;width:160px;height:45px;border:0;outline:none;color:${BRAND.white};font-family:${BRAND.display};font-size:20px;font-weight:600;letter-spacing:4px">
<div style="margin-top:20px;font-family:${BRAND.display};font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${BRAND.orange}">Translation Helper</div>
</td></tr>
<tr><td bgcolor="${BRAND.white}" style="background:${BRAND.white};padding:36px 32px 16px;font-family:${APP.font};color:${APP.foreground}">
<h1 style="margin:0;font-family:${APP.font};font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.5px;color:${APP.foreground}">${escapeHtml(greeting)}</h1>
<p style="margin:4px 0 24px;font-size:15px;line-height:22px;color:${APP.mutedForeground}">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${htmlItems}
</table>
</td></tr>
<tr><td bgcolor="${BRAND.white}" style="background:${BRAND.white};padding:0 32px 32px">
<div style="height:4px;width:48px;background:${BRAND.orange};font-size:0;line-height:0">&nbsp;</div>
</td></tr>
<tr><td align="center" style="padding:24px 16px 0;font-family:${APP.font};font-size:12px;line-height:18px;color:${APP.mutedForeground}">
You get these because of your work in Translation Helper for Exodus 90.<br>
<a href="${escapeHtml(preferencesUrl)}" style="color:${APP.foreground};text-decoration:underline">Choose which emails you get</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

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

/**
 * One card, shaped like a row in the app's inbox: the notification's chip, its
 * title and body. Overdue and due-soon cards are tinted with their chip so
 * late work stands out, and overdue work gets a button rather than a link.
 */
function renderItem(item: DigestItem, appUrl: string): string {
  const { tone, tag: label } = NOTIFICATION_CATALOG[item.type];
  const chip = chipFor(item.type);
  const urgent = tone === 'overdue' || tone === 'soon';
  const background = urgent ? chip.fill : BRAND.white;
  const border = urgent ? chip.border : APP.border;

  const tag = `<span style="display:inline-block;padding:2px 8px;border:1px solid ${chip.border};border-radius:999px;background:${chip.fill};color:${chip.text};font-family:${APP.font};font-size:12px;line-height:16px;font-weight:500;white-space:nowrap">${escapeHtml(label)}</span>`;

  const title = escapeHtml(item.title);
  const href = item.url ? escapeHtml(absolute(appUrl, item.url)) : null;
  const heading = href ? `<a href="${href}" style="color:${APP.foreground};text-decoration:none">${title}</a>` : title;
  const body = item.body
    ? `<div style="margin-top:4px;color:${APP.mutedForeground};font-size:14px;line-height:20px">${escapeHtml(item.body)}</div>`
    : '';

  // Late work gets a button, not a link: it is the one thing in the email to do today.
  const open = !href
    ? ''
    : tone === 'overdue'
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr><td bgcolor="${APP.primary}" style="background:${APP.primary};border-radius:8px"><a href="${href}" style="display:inline-block;padding:8px 16px;font-family:${APP.font};font-size:14px;line-height:20px;font-weight:500;color:${BRAND.white};text-decoration:none;white-space:nowrap">Open now &rarr;</a></td></tr></table>`
      : `<div style="margin-top:12px"><a href="${href}" style="font-family:${APP.font};font-size:14px;line-height:20px;font-weight:500;color:${APP.foreground};text-decoration:underline;white-space:nowrap">Open &rarr;</a></div>`;

  return `<tr><td style="padding:0 0 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${background}" style="background:${background};border:1px solid ${border};border-radius:${APP.radius};padding:16px 20px">
${tag}
<div style="margin-top:10px;font-family:${APP.font};font-size:16px;line-height:24px;font-weight:600;color:${APP.foreground}">${heading}</div>${body}${open}
</td></tr></table>
</td></tr>`;
}
