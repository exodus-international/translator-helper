'use client';

import { capture } from '@/lib/analytics';
import { Bug, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SUPPORT_URL = 'https://exodus90.atlassian.net/servicedesk/customer/portal/1';

/**
 * Pre-fills the service-desk ticket with the page the reporter was on, on this
 * environment's own origin, so a bug from staging doesn't claim production.
 * The origin comes from NEXT_PUBLIC_APP_URL rather than `window.location`
 * because these links also render on the server.
 */
export function bugReportUrl(
  pathname: string,
  origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
) {
  const url = new URL('https://exodus90.atlassian.net/servicedesk/customer/portal/1/group/1/create/10009');
  url.searchParams.set('customfield_10043', new URL(pathname, origin).href);
  return url.href;
}

/**
 * The floating pair, kept for signed-out pages (login, register, invites),
 * which have no sidebar to hold the same two links.
 */
export function FeedbackButton() {
  const pathname = usePathname();

  const bugReportHref = bugReportUrl(pathname);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex gap-2">
      <Link
        href={SUPPORT_URL}
        target="_blank"
        title="Support"
        onClick={() => capture('support_link_clicked')}
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <LifeBuoy className="h-4 w-4" aria-label="Support" />
      </Link>
      <Link
        href={bugReportHref}
        target="_blank"
        title="Report a bug"
        onClick={() => capture('bug_report_clicked', { path: pathname })}
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bug className="h-4 w-4" aria-label="Report a bug" />
      </Link>
    </div>
  );
}
