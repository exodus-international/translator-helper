import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BibleChat } from '@/components/bible/chat/bible-chat';
import { PageHeader } from '@/components/page-header';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Bible' };

/** `?translation=hr` (or a translation code) opens the chat in that Bible. */
export default async function BiblePage({ searchParams }: { searchParams: Promise<{ translation?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?from=/bible');

  const requested = (await searchParams).translation;
  const translation = typeof requested === 'string' && /^[a-z0-9-]{2,40}$/i.test(requested) ? requested : undefined;

  return (
    <div className="flex h-[calc(100svh-var(--header-height,3rem))] min-h-0 flex-col">
      <PageHeader title="Bible" description="Find passages and check citations in the official translations." />
      <div className="min-h-0 flex-1">
        <BibleChat translation={translation} />
      </div>
    </div>
  );
}
