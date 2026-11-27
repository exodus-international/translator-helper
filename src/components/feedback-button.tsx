'use client';

import { capture } from '@/lib/analytics';
import { Bug, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SUPPORT_URL = 'https://exodus90.atlassian.net/servicedesk/customer/portal/1';

const APP_ORIGIN = 'https://exodus-translations.ff0000.cz';
const BUG_REPORT_FORM = 'https://exodus90.atlassian.net/servicedesk/customer/portal/1/group/1/create/10009';

/**
 * Pre-fills the service-desk ticket with the page the reporter was on.
 * `pathname` starts with a slash, so it is resolved against the origin, not
 * appended to it: appending gave `…ff0000.cz//documents`.
 */
export function bugReportUrl(pathname: string) {
  const page = new URL(pathname.replace(/^\/+/, '/'), APP_ORIGIN).toString();
  return `${BUG_REPORT_FORM}?customfield_10043=${encodeURIComponent(page)}`;
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
