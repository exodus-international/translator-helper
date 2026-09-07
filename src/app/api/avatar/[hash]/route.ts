import { AVATAR_PROXY_SIZES } from '@/lib/gravatar';
import { NextRequest } from 'next/server';

const HASH = /^[0-9a-f]{64}$/;

/** A miss is the common case, so remember it too rather than asking again per page view. */
const CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

/**
 * Gravatar, fetched by us instead of by the reader's browser.
 *
 * Going direct is what a Gravatar normally looks like, but `gravatar.com` is on
 * the usual tracker blocklists, so for anyone running a content blocker or
 * strict tracking protection the picture simply never arrives — the same reason
 * this app already tunnels Sentry. Fetching server-side also means Gravatar
 * never sees a reader's IP address or which page they are on.
 *
 * The route is deliberately narrow: a 64-character hex hash, one of the sizes
 * the avatars actually use, and one upstream host. It exposes nothing that is
 * not already public at that URL.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!HASH.test(hash)) {
    return new Response(null, { status: 400 });
  }

  const size = Number(request.nextUrl.searchParams.get('s'));
  if (!AVATAR_PROXY_SIZES.includes(size)) {
    return new Response(null, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`);
  } catch {
    // Gravatar being unreachable is a missing picture, not a broken page.
    return new Response(null, { status: 404 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': CACHE } });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': CACHE,
    },
  });
}
