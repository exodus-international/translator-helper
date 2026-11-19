import { Role } from '@/generated/prisma/enums';
import { decodeUpload, importDeclarations, importTranslation, MAX_UPLOAD_BYTES } from '@/domain/bible/bible.import';
import { BibleImportError } from '@/domain/bible/bible.repository';
import { TRANSLATION_CODE } from '@/domain/bible/bible.types';
import { getCurrentUser } from '@/lib/session';

/**
 * Admin upload of a bible-api translation file and/or its versification file.
 * Multipart form: `translation` (file, JSON or gzip), `versification` (file,
 * optional), and optional `code`, `name`, `languageCode`, `languageName`, `role`.
 * With only `versification` and `code`, replaces that translation's declarations.
 * A server action can't take this: its body limit is 3 MB.
 */

export const maxDuration = 300;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Sign in again.' }, 401);
  if (user.role !== Role.ADMIN) return json({ error: 'Only admins can import Bibles.' }, 403);

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 2 * MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: 'The upload is too large.' }, 413);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return json({ error: 'Send the files as a form.' }, 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
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
