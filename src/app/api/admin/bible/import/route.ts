import { handleBibleImport } from '@/domain/bible/bible.requests';
import { getCurrentUser } from '@/lib/session';

/**
 * Admin upload of a bible-api translation and/or versification file; see
 * `handleBibleImport`. A server action can't take this: its body limit is 3 MB.
 */

export const maxDuration = 300;

export async function POST(request: Request) {
  return handleBibleImport(request, await getCurrentUser());
}
