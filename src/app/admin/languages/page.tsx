import { redirect } from 'next/navigation';

/**
 * Language management moved to /languages, where everything scoped to a
 * language lives on one page. The old route still resolves because it is in
 * Slack messages and mail — a 307 rather than a permanent redirect, the same
 * courtesy #138 extended to project URLs, so a cached response cannot outlive
 * the route it points at.
 */
export default async function AdminLanguagesPage() {
  redirect('/languages');
}
