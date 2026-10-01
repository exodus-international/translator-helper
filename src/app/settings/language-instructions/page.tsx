import { redirect } from 'next/navigation';

/**
 * The AI instructions moved to /instructions, where a language's own team can
 * reach them rather than admins alone. The old route still resolves because it
 * is in Slack messages and mail — a 307, like the other retired routes, so a
 * cached response cannot outlive the path it points at.
 *
 * This was the only child of /settings; the segment has no other page.
 */
export default async function LanguageInstructionsPage() {
  redirect('/instructions');
}
