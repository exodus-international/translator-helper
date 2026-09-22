import { createConsoleTransport } from './transports/console';
import { createResendTransport } from './transports/resend';
import { createSmtpTransport } from './transports/smtp';
import type { EmailMessage, EmailTransport, SendResult } from './types';

export type { EmailMessage, SendResult } from './types';

type Env = Record<string, string | undefined>;

/**
 * Picks the transport from the environment. EMAIL_PROVIDER names it outright
 * (`resend`, `smtp` or `console`); without it, whichever provider's settings
 * are present is used. Null means email is off: notifications stay in the app.
 * EMAIL_FROM is required either way.
 */
export function resolveEmailTransport(env: Env): EmailTransport | null {
  if (!env.EMAIL_FROM) return null;

  const provider = env.EMAIL_PROVIDER?.toLowerCase() || (env.RESEND_API_KEY ? 'resend' : env.SMTP_HOST ? 'smtp' : '');

  switch (provider) {
    case 'resend':
      return env.RESEND_API_KEY ? createResendTransport(env.RESEND_API_KEY) : null;
    case 'smtp': {
      if (!env.SMTP_HOST) return null;
      const port = Number(env.SMTP_PORT || 587);
      return createSmtpTransport({
        host: env.SMTP_HOST,
        port,
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
        user: env.SMTP_USER || undefined,
        pass: env.SMTP_PASS || undefined,
      });
    }
    case 'console':
      return createConsoleTransport();
    default:
      return null;
  }
}

let cached: { transport: EmailTransport | null } | null = null;

function transport(): EmailTransport | null {
  cached ??= { transport: resolveEmailTransport(process.env) };
  return cached.transport;
}

export function isEmailConfigured(): boolean {
  return transport() !== null;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const active = transport();
  if (!active) {
    return { ok: false, error: 'Email is not configured', retryable: false, rateLimited: false };
  }
  return active.send({ ...message, from: process.env.EMAIL_FROM!, replyTo: process.env.EMAIL_REPLY_TO || undefined });
}
