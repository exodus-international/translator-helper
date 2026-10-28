/**
 * An expected "no" from a server action, returned instead of thrown.
 *
 * Most of these come from a page that went stale: someone else applied the
 * suggestion or approved the document after this page loaded, or a retried
 * request arrives after the first one already landed. A thrown error reaches
 * the browser with its message hidden in production builds and lands in
 * Sentry as a crash. A refusal reaches the browser intact, so the client can
 * show the message and reload what it shows.
 */
export interface Refusal<Detail extends object = object> {
  refused: { message: string } & Detail;
}

export function refuse<Detail extends object = object>(message: string, detail?: Detail): Refusal<Detail> {
  return { refused: { message, ...(detail as Detail) } };
}

export function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && 'refused' in value;
}
