import { handleBibleChat } from '@/domain/bible/bible.requests';
import { getCurrentUser } from '@/lib/session';

/** The Scripture chat, streamed as NDJSON; see `handleBibleChat`. */

export const maxDuration = 300;

export async function POST(request: Request) {
  return handleBibleChat(request, await getCurrentUser());
}
