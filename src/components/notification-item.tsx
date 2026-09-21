'use client';

import { NOTIFICATION_CATALOG, type NotificationTone } from '@/domain/notification/notification.catalog';
import type { InboxNotification } from '@/domain/notification/notification.repository';
import { NotificationType } from '@/generated/prisma/enums';
import { formatTimeAgo } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  CalendarClock,
  CalendarX2,
  CircleCheck,
  Clock,
  FileSearch,
  type LucideIcon,
  MessageSquarePlus,
  MessageSquareText,
  Siren,
  Undo2,
  UserCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';

const ICONS: Record<NotificationType, LucideIcon> = {
  [NotificationType.ASSIGNED_TRANSLATOR]: UserPlus,
  [NotificationType.ASSIGNED_REVIEWER]: UserCheck,
  [NotificationType.UNASSIGNED]: UserMinus,
  [NotificationType.REVIEW_REQUESTED]: FileSearch,
  [NotificationType.DEADLINE_CHANGED]: CalendarClock,
  [NotificationType.DEADLINE_APPROACHING]: Clock,
  [NotificationType.DEADLINE_PASSED]: CalendarX2,
  [NotificationType.DEADLINE_ESCALATION]: Siren,
  [NotificationType.CHANGES_REQUESTED]: Undo2,
  [NotificationType.TRANSLATION_APPROVED]: CircleCheck,
  [NotificationType.SUGGESTION_ADDED]: MessageSquarePlus,
  [NotificationType.SUGGESTION_REPLY]: MessageSquareText,
};

/** The same tones as the email, in the app's own colours. */
const TONE_CLASSES: Record<NotificationTone, { icon: string; tag: string }> = {
  overdue: { icon: 'bg-destructive/10 text-destructive', tag: 'text-destructive' },
  soon: { icon: 'bg-warning/15 text-warning', tag: 'text-warning' },
  action: { icon: 'bg-foreground text-background', tag: 'text-foreground' },
  info: { icon: 'bg-muted text-muted-foreground', tag: 'text-muted-foreground' },
};

interface NotificationItemProps {
  notification: InboxNotification;
  onSelect: (notification: InboxNotification) => void;
  /** Roomier rows for the full page; the bell keeps them tight. */
  size?: 'compact' | 'comfortable';
}

/** One row of the inbox: what happened, to what, and when, with its unread state. */
export function NotificationItem({ notification, onSelect, size = 'compact' }: NotificationItemProps) {
  const { tag, tone } = NOTIFICATION_CATALOG[notification.type];
  const Icon = ICONS[notification.type];
  const classes = TONE_CLASSES[tone];
  const unread = !notification.readAt;

  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={cn(
        // Rows are pressed dozens of times a day, so feedback is a colour change
        // (instant on touch, 150ms on hover) rather than motion.
        'flex w-full cursor-pointer gap-3 text-left transition-[background-color] duration-150 ease-out outline-none',
        'hover:bg-muted active:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
        size === 'compact' ? 'px-4 py-3' : 'px-4 py-4 sm:px-5',
        unread && 'bg-primary/[0.03]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md',
          size === 'compact' ? 'size-8' : 'size-9',
          classes.icon,
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] leading-none">
          <span className={cn('font-semibold tracking-wide uppercase', classes.tag)}>{tag}</span>
          <span className="text-muted-foreground">·</span>
          <time
            className="text-muted-foreground tabular-nums"
            dateTime={new Date(notification.createdAt).toISOString()}
          >
            {formatTimeAgo(notification.createdAt)}
          </time>
        </span>
        <span
          className={cn(
            'mt-1.5 block leading-snug text-pretty',
            size === 'compact' ? 'text-sm' : 'text-[15px]',
            unread ? 'font-semibold' : 'font-medium text-foreground/80',
          )}
        >
          {notification.title}
          {unread && <span className="sr-only"> (unread)</span>}
        </span>
        {notification.body && (
          <span
            className={cn(
              'mt-0.5 block text-sm leading-snug text-pretty text-muted-foreground',
              size === 'compact' && 'line-clamp-2',
            )}
          >
            {notification.body}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-1 size-2 shrink-0 rounded-full bg-destructive transition-[opacity,scale] duration-150 ease-out',
          unread ? 'opacity-100' : 'scale-50 opacity-0',
        )}
      />
    </button>
  );
}

/** The red unread count, shared by the bell and the page so they read as one signal. */
export function UnreadCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums',
        // Enters from 90% rather than from nothing; a transition, not a keyframe,
        // so a count that changes mid-entrance simply retargets.
        'transition-[opacity,scale] duration-150 ease-out starting:scale-90 starting:opacity-0',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** A row-shaped placeholder while the inbox loads, so the popover doesn't jump. */
export function NotificationItemSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3" aria-hidden>
      <Skeleton className="size-8 shrink-0" />
      <div className="flex flex-1 flex-col gap-2 pt-0.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}
