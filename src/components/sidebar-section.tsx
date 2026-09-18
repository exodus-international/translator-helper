import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The one frame every right-sidebar section uses: an uppercase label row with
 * an optional action, then flat content. No rounded corners or margins of its
 * own, so the sections stack as one list inside whichever card holds them --
 * assignment, audio, deploy, activity log.
 *
 * It paints no surface beyond its label row: it is always mounted inside the
 * editor's right panel, and a second background there would band the panel in
 * dark mode, where `--background` is darker than the sidebar it sits on.
 */
export function SidebarSection({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn('border-b', className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
        {action}
      </div>
      <div className={cn('min-w-0 overflow-hidden px-3 py-3', contentClassName)}>{children}</div>
    </section>
  );
}
