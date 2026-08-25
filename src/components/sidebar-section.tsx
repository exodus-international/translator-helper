import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The one frame every right-sidebar panel uses: an uppercase label row with
 * an optional action, then flat content. No rounded cards, no margins, so
 * document info, audio, deploy, activity log and feedback read as one list.
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
    <section className={cn('border-b bg-white', className)}>
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b bg-muted/60">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
        {action}
      </div>
      <div className={cn('px-3 py-3', contentClassName)}>{children}</div>
    </section>
  );
}
