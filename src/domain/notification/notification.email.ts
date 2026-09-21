import type { NotificationType } from '@/generated/prisma/enums';
import { NOTIFICATION_CATALOG, TONE_ORDER } from './notification.catalog';

const MINUTE = 60 * 1000;

/** How long a burst of activity must go quiet before its digest is sent. */
export const DIGEST_QUIET_PERIOD = 5 * MINUTE;
/** The longest a notification waits for a busy burst to go quiet. */
export const DIGEST_MAX_WAIT = 30 * MINUTE;
/** Older unsent notifications are dropped from email, not sent days late. */
export const EMAIL_MAX_AGE = 3 * 24 * 60 * MINUTE;

/**
 * Whether a user's pending notifications should go out now. A manager
 * assigning thirty documents produces thirty notifications in a minute; waiting
 * for the burst to settle turns them into one email instead of thirty, which
 * also keeps the whole team inside a small daily sending quota.
 */
export function isDigestDue(createdAts: Date[], now: Date): boolean {
  if (createdAts.length === 0) return false;
  const times = createdAts.map((date) => date.getTime());
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  return now.getTime() - newest >= DIGEST_QUIET_PERIOD || now.getTime() - oldest >= DIGEST_MAX_WAIT;
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

/** Exodus 90 brand palette and type (docs/BRANDING.md, brand standards). */
const BRAND = {
  orange: '#FF4800',
  black: '#171618',
  ink: '#272428',
  muted: '#5E5C66',
  faint: '#8A8894',
  line: '#DCE0E9',
  canvas: '#F1F3F8',
  orangeTint: '#FFF1EB',
  onBlackMuted: '#C9CBD4',
  white: '#FFFFFF',
  display: "'Clash Display','Helvetica Neue',Helvetica,Arial,sans-serif",
  body: "Lato,'Helvetica Neue',Helvetica,Arial,sans-serif",
};

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
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.canvas}">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.canvas}" style="background:${BRAND.canvas}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td align="center" bgcolor="${BRAND.black}" style="background:${BRAND.black};padding:36px 32px 28px">
<img src="${escapeHtml(absolute(appUrl, LOGO_PATH))}" width="160" height="45" alt="Exodus 90" style="display:block;width:160px;height:45px;border:0;outline:none;color:${BRAND.white};font-family:${BRAND.display};font-size:20px;font-weight:600;letter-spacing:4px">
<div style="margin-top:20px;font-family:${BRAND.display};font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${BRAND.orange}">Translation Helper</div>
</td></tr>
<tr><td bgcolor="${BRAND.white}" style="background:${BRAND.white};padding:36px 32px 16px;font-family:${BRAND.body};color:${BRAND.ink}">
<h1 style="margin:0;font-family:${BRAND.display};font-size:26px;line-height:32px;font-weight:600;letter-spacing:-0.5px;color:${BRAND.black}">${escapeHtml(greeting)}</h1>
<p style="margin:8px 0 24px;font-size:15px;line-height:22px;color:${BRAND.muted}">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${htmlItems}
</table>
</td></tr>
<tr><td bgcolor="${BRAND.white}" style="background:${BRAND.white};padding:0 32px 32px">
<div style="height:4px;width:48px;background:${BRAND.orange};font-size:0;line-height:0">&nbsp;</div>
</td></tr>
<tr><td align="center" style="padding:24px 16px 0;font-family:${BRAND.body};font-size:12px;line-height:18px;color:${BRAND.faint}">
You get these because of your work in Translation Helper for Exodus 90.<br>
<a href="${escapeHtml(preferencesUrl)}" style="color:${BRAND.muted};text-decoration:underline">Choose which emails you get</a>
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

/** One card. Each tone sets the card, its tag and its link; the text inside is the same. */
function renderItem(item: DigestItem, appUrl: string): string {
  const { tone, tag: label } = NOTIFICATION_CATALOG[item.type];
  const dark = tone === 'overdue';
  const titleColor = dark ? BRAND.white : BRAND.black;
  const bodyColor = dark ? BRAND.onBlackMuted : BRAND.muted;

  const card = {
    overdue: `background:${BRAND.black}`,
    soon: `background:${BRAND.orangeTint};border:1px solid ${BRAND.orange}`,
    action: `background:${BRAND.white};border:1px solid ${BRAND.black}`,
    info: `background:${BRAND.white};border:1px solid ${BRAND.line}`,
  }[tone];
  const bgcolor = { overdue: BRAND.black, soon: BRAND.orangeTint, action: BRAND.white, info: BRAND.white }[tone];

  const tagColors = {
    overdue: `background:${BRAND.orange};color:${BRAND.white}`,
    soon: `background:${BRAND.orange};color:${BRAND.white}`,
    action: `background:${BRAND.black};color:${BRAND.white}`,
    info: `background:${BRAND.canvas};color:${BRAND.muted}`,
  }[tone];
  const tag = `<span style="display:inline-block;padding:4px 8px;${tagColors};font-family:${BRAND.display};font-size:10px;line-height:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase">${escapeHtml(label)}</span>`;

  const title = escapeHtml(item.title);
  const href = item.url ? escapeHtml(absolute(appUrl, item.url)) : null;
  const heading = href ? `<a href="${href}" style="color:${titleColor};text-decoration:none">${title}</a>` : title;
  const body = item.body
    ? `<div style="margin-top:6px;color:${bodyColor};font-size:15px;line-height:22px">${escapeHtml(item.body)}</div>`
    : '';

  // Late work gets a button, not a link: it is the one thing in the email to do today.
  const open = !href
    ? ''
    : dark
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr><td bgcolor="${BRAND.orange}" style="background:${BRAND.orange}"><a href="${href}" style="display:inline-block;padding:10px 18px;font-family:${BRAND.display};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${BRAND.white};text-decoration:none">Open now &rarr;</a></td></tr></table>`
      : `<div style="margin-top:12px"><a href="${href}" style="font-family:${BRAND.display};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${BRAND.black};text-decoration:none">Open <span style="color:${BRAND.orange}">&rarr;</span></a></div>`;

  return `<tr><td style="padding:0 0 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bgcolor}" style="${card};padding:20px">
${tag}
<div style="margin-top:12px;font-family:${BRAND.body};font-size:16px;line-height:24px;font-weight:700;color:${titleColor}">${heading}</div>${body}${open}
</td></tr></table>
</td></tr>`;
}
