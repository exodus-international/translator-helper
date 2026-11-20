import { z } from 'zod';
import { Role } from '@/generated/prisma/enums';
import { readBody } from '@/lib/read-body';
import type { SessionUser } from '@/lib/session';
import { CHAT_LIMITS, runBibleChat, type ChatDeps, type ChatEvent } from './bible.chat';
import { decodeUpload, importDeclarations, importTranslation, MAX_UPLOAD_BYTES } from './bible.import';
import { BibleImportError } from './bible.repository';
import { TRANSLATION_CODE } from './bible.types';

/**
 * The two Bible endpoints that are not server actions, as plain functions of
 * the request and the signed-in user, so their answers can be tested without
 * a running server. The route files only add the session.
 */

const json = (body: unknown, status = 200) => Response.json(body, { status });

// ─── Import ───────────────────────────────────────────────

/**
 * Admin upload of a bible-api translation file and/or its versification file.
 * Multipart form: `translation` (file, JSON or gzip), `versification` (file,
 * optional), and optional `code`, `name`, `languageCode`, `languageName`, `role`.
 * With only `versification` and `code`, replaces that translation's declarations.
 */
export async function handleBibleImport(request: Request, user: SessionUser | null): Promise<Response> {
  if (!user) return json({ error: 'Sign in again.' }, 401);
  if (user.role !== Role.ADMIN) return json({ error: 'Only admins can import Bibles.' }, 403);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return json({ error: 'Send the files as a form.' }, 415);
  }

  let form: FormData;
  try {
    const body = await readBody(request, 2 * MAX_UPLOAD_BYTES + 64 * 1024);
    if (!body) return json({ error: 'The upload is too large.' }, 413);
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return json({ error: 'The upload could not be read.' }, 400);
  }

  const translation = form.get('translation');
  const versification = form.get('versification');
  const files = [translation, versification].filter((f): f is File => f instanceof File && f.size > 0);
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) return json({ error: 'A file is too large.' }, 413);

  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined;
  };
  const role = text('role');

  try {
    if (translation instanceof File && translation.size > 0) {
      const result = await importTranslation({
        translationText: decodeUpload(new Uint8Array(await translation.arrayBuffer())),
        declarationsText:
          versification instanceof File && versification.size > 0
            ? decodeUpload(new Uint8Array(await versification.arrayBuffer()))
            : null,
        meta: {
          code: text('code'),
          name: text('name'),
          languageCode: text('languageCode'),
          languageName: text('languageName'),
          role: role === 'source' || role === 'target' ? role : undefined,
        },
        userId: user.id,
      });
      return json({ ok: true, ...result });
    }
    if (versification instanceof File && versification.size > 0) {
      const code = text('code');
      if (!code || !TRANSLATION_CODE.test(code)) return json({ error: 'Say which translation the versification is for.' }, 400);
      const result = await importDeclarations(code, decodeUpload(new Uint8Array(await versification.arrayBuffer())));
      return json({ ok: true, ...result });
    }
    return json({ error: 'Choose a translation or versification file.' }, 400);
  } catch (error) {
    if (error instanceof BibleImportError) return json({ error: error.message }, 422);
    console.error('[Bible] Import failed:', error);
    return json({ error: 'The import failed; nothing was changed.' }, 500);
  }
}

// ─── Chat ─────────────────────────────────────────────────

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

const bodySchema = z.object({
  messages: z
    .array(
      // An answer comes back as the model wrote it, however long; the chat
      // keeps only the recent messages and clips each, and the body limit
      // bounds the request.
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1)
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


/**
 * The Scripture chat. POST `{ messages, translation }`; the reply is NDJSON,
 * one event per line as the assistant works (see `ChatEvent`): `tool` when it
 * looks something up, `passages` with the official text it found, `text` as
 * its answer streams, `error`, and always a closing `done`.
 */
export async function handleBibleChat(
  request: Request,
  user: SessionUser | null,
  deps: Omit<ChatDeps, 'signal'> = {},
): Promise<Response> {
  if (!user) return json({ error: 'Sign in again.' }, 401);

  const retryAfter = rateLimited(user.id);
  if (retryAfter !== null) {
    return Response.json(
      { error: 'Too many questions at once. Wait a moment and ask again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readBody(request, MAX_BODY_BYTES);
  } catch {
    return json({ error: 'The request could not be read.' }, 400);
  }
  if (!body) return json({ error: 'The conversation is too long. Start a new one.' }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return json({ error: 'The request could not be read.' }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'The request is not valid.' }, 400);
  }

  const encoder = new TextEncoder();
  const events = runBibleChat(parsed.data, { ...deps, signal: request.signal });
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
