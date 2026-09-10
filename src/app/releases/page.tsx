import { getReleaseNotes } from '@/lib/release-notes';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import ReleasesClient from './page.client';

export default async function ReleasesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const releases = getReleaseNotes();

  return <ReleasesClient releases={releases} />;
}
