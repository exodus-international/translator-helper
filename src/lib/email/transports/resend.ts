import type { EmailTransport } from '../types';

const ENDPOINT = 'https://api.resend.com/emails';

/** Resend's HTTP API. Needs RESEND_API_KEY. */
export function createResendTransport(apiKey: string): EmailTransport {
  return {
    name: 'resend',
    async send(message) {
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          retryable: true,
          rateLimited: false,
        };
      }

      if (response.ok) {
        const data = (await response.json().catch(() => ({}))) as { id?: string };
        return { ok: true, id: data.id ?? '' };
      }

      const detail = await response.text().catch(() => '');
      // 429 is both the per-second rate limit and the daily/monthly quota.
      const rateLimited = response.status === 429;
      return {
        ok: false,
        error: `Resend ${response.status}: ${detail.slice(0, 500)}`,
        retryable: rateLimited || response.status >= 500,
        rateLimited,
      };
    },
  };
}
