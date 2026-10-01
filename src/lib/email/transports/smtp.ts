import nodemailer from 'nodemailer';
import type { EmailTransport, SendResult } from '../types';

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when offered. */
  secure: boolean;
  user?: string;
  pass?: string;
}

/**
 * Any SMTP server: Resend, Postmark, SES, Mailgun, Brevo, a company relay, or
 * Mailpit locally. Switching providers is a change of SMTP_* variables.
 */
export function createSmtpTransport(config: SmtpConfig): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
  });

  return {
    name: `smtp (${config.host}:${config.port})`,
    async send(message) {
      try {
        const info = await transporter.sendMail({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
        });
        return { ok: true, id: info.messageId ?? '' };
      } catch (error) {
        return classifySmtpError(error);
      }
    },
  };
}

/**
 * SMTP says what went wrong with its reply code: 4xx is "try again later",
 * 5xx is "this will never work". No code at all means the connection itself
 * failed, which is worth another try.
 */
export function classifySmtpError(error: unknown): Extract<SendResult, { ok: false }> {
  const { responseCode, message } = (error ?? {}) as { responseCode?: number; message?: string };
  const text = message ?? String(error);
  const rateLimited = responseCode === 421 || responseCode === 454 || /rate|too many|quota|throttl/i.test(text);

  if (responseCode === undefined) {
    return { ok: false, error: text, retryable: true, rateLimited };
  }
  return {
    ok: false,
    error: `SMTP ${responseCode}: ${text}`,
    retryable: rateLimited || (responseCode >= 400 && responseCode < 500),
    rateLimited,
  };
}
