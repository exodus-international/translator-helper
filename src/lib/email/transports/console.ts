import type { EmailTransport } from '../types';

/** Prints emails to the server log instead of sending them. For development. */
export function createConsoleTransport(): EmailTransport {
  return {
    name: 'console',
    async send(message) {
      console.log(
        `[Email] To: ${message.to}\n[Email] From: ${message.from}\n[Email] Subject: ${message.subject}\n${message.text}`,
      );
      return { ok: true, id: `console-${Date.now()}` };
    },
  };
}
