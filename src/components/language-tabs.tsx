'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Real routes rather than client-side tab state, matching the document editor:
 * deep links into a language's team are the point, so a PM can be sent straight
 * to /languages/hr/team.
 */
const TABS = [
  { segment: '', label: 'Overview' },
  { segment: 'team', label: 'Team' },
  { segment: 'settings', label: 'Settings' },
] as const;

export function LanguageTabs({
  code,
  memberCount,
  includeTeam = true,
}: {
  code: string;
  memberCount?: number;
  /** The source language has no team: nothing is translated into it. */
  includeTeam?: boolean;
}) {
  const pathname = usePathname();
  const base = `/languages/${encodeURIComponent(code)}`;

  return (
    <div className="mt-4 flex gap-5 overflow-x-auto">
      {TABS.filter((tab) => includeTeam || (tab.segment !== 'team' && tab.segment !== '')).map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = pathname === href;

        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 border-b-2 pb-2.5 text-sm whitespace-nowrap transition-colors',
              active
                ? 'border-foreground text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {tab.label}
            {tab.segment === 'team' && memberCount !== undefined && (
              <span className="text-muted-foreground text-xs font-normal">{memberCount}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
