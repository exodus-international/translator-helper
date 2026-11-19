import { z } from 'zod';
import { CHAT_LIMITS, runBibleChat, type ChatEvent } from '@/domain/bible/bible.chat';
import { getCurrentUser } from '@/lib/session';

/**
 * The Scripture chat. POST `{ messages, translation }`; the reply is NDJSON,
 * one event per line as the assistant works (see `ChatEvent`): `tool` when it
 * looks something up, `passages` with the official text it found, `text` as
 * its answer streams, `error`, and always a closing `done`.
 */

export const maxDuration = 300;

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(CHAT_LIMITS.maxAssistantChars * 2),
      }),
    )
    .min(1)
    .max(200)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must be the question.')
    .refine(
      (messages) => messages.every((m) => m.role !== 'user' || m.content.length <= CHAT_LIMITS.maxUserChars),
      `Keep each message under ${CHAT_LIMITS.maxUserChars} characters.`,
    ),
  translation: z.string().trim().min(2).max(40),
});

declare global {
  var bibleChatRequests: Map<string, number[]> | undefined;
}

/** Per user and per process: enough to stop a runaway client, not a quota. */
function rateLimited(userId: string): number | null {
  const requests = (globalThis.bibleChatRequests ??= new Map<string, number[]>());
  const now = Date.now();
  const recent = (requests.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requests.set(userId, recent);
    return Math.ceil((recent[0]! + RATE_WINDOW_MS - now) / 1000);
  }
  recent.push(now);
  requests.set(userId, recent);
  if (requests.size > 5000) {
    for (const [id, times] of requests) if (times.every((t) => now - t >= RATE_WINDOW_MS)) requests.delete(id);
  }
  return null;
}

const json = (body: unknown, status: number, headers?: HeadersInit) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Sign in again.' }, 401);

  const retryAfter = rateLimited(user.id);
  if (retryAfter !== null) {
    return json({ error: 'Too many questions at once. Wait a moment and ask again.' }, 429, {
      'Retry-After': String(retryAfter),
    });
  }

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json({ error: 'The conversation is too long. Start a new one.' }, 413);
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'The request could not be read.' }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'The request is not valid.' }, 400);
  }

  const encoder = new TextEncoder();
  const events = runBibleChat(parsed.data, { signal: request.signal });
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(value satisfies ChatEvent)}\n`));
      } catch (error) {
        // runBibleChat reports its own failures; this is only reached on an abort mid-write.
        console.error('[Bible chat] stream failed:', error);
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
