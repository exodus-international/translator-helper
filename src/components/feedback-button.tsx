'use client';

import { Bug, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function FeedbackButton() {
  const pathname = usePathname();

  const bugReportHref = `https://exodus90.atlassian.net/servicedesk/customer/portal/1/group/1/create/10009?customfield_10043=https://exodus-translations.ff0000.cz/${pathname}`;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex gap-2">
      <Link
        href="https://exodus90.atlassian.net/servicedesk/customer/portal/1"
        target="_blank"
        title="Support"
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <LifeBuoy className="h-4 w-4" aria-label="Support" />
      </Link>
      <Link
        href={bugReportHref}
        target="_blank"
        title="Report a bug"
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bug className="h-4 w-4" aria-label="Report a bug" />
      </Link>
    </div>
  );
}
