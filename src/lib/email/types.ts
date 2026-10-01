export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      /** False when sending again cannot help: a bad address, a rejected payload. */
      retryable: boolean;
      /** The provider wants us to back off; nothing else will get through this run. */
      rateLimited: boolean;
    };

/**
 * One way of getting an email out. Adding a provider means writing one of
 * these and listing it in `./index.ts`; nothing that sends email knows which
 * one is in use.
 */
export interface EmailTransport {
  /** Shown in logs. */
  name: string;
  send(message: EmailMessage & { from: string; replyTo?: string }): Promise<SendResult>;
}
