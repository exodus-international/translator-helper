'use client';

import { NotificationItem, NotificationItemSkeleton, UnreadCount } from '@/components/notification-item';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  getInboxAction,
  getUnreadCountAction,
  markNotificationsReadAction,
} from '@/domain/notification/notification.actions';
import type { InboxNotification } from '@/domain/notification/notification.repository';
import { capture } from '@/lib/analytics';
import { useNotificationCount } from '@/lib/notification-count';
import { ArrowRight, Bell, BellOff, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Often enough that a new assignment shows up while someone is working. */
const POLL_INTERVAL_MS = 60_000;

/** How old the loaded list may be before opening the bell refreshes it. */
const STALE_AFTER_MS = 15_000;

/**
 * The inbox in the topbar. The badge polls while the tab is visible, and
 * catches up as soon as it becomes visible again. The list is loaded ahead of
 * time (on mount, when the count changes, and when the pointer reaches the
 * bell), so the popover opens at its final size instead of growing from a
 * placeholder halfway through its entrance.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useNotificationCount((state) => state.unread);
  const setUnread = useNotificationCount((state) => state.setUnread);
  const [notifications, setNotifications] = useState<InboxNotification[] | null>(null);
  const loadedAt = useRef(0);
  const knownUnread = useRef<number | null>(null);

  useEffect(() => {
    knownUnread.current = unread;
  }, [unread]);

  const loadInbox = useCallback(async () => {
    loadedAt.current = Date.now();
    try {
      const inbox = await getInboxAction();
      setNotifications(inbox.notifications);
      setUnread(inbox.unread);
    } catch {
      loadedAt.current = 0;
      setNotifications((current) => current ?? []);
    }
  }, [setUnread]);

  const loadInboxIfStale = useCallback(() => {
    if (Date.now() - loadedAt.current > STALE_AFTER_MS) void loadInbox();
  }, [loadInbox]);

  const refreshCount = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const count = await getUnreadCountAction();
      // Something new arrived (or was read elsewhere): have the list ready too.
      if (count !== knownUnread.current) void loadInbox();
      else setUnread(count);
    } catch {
      // A missed poll is not worth a toast; the next one will try again.
    }
  }, [loadInbox, setUnread]);

  useEffect(() => {
    // The first count and list arrive together, at once.
    const first = setTimeout(loadInbox, 0);
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshCount);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshCount);
    };
  }, [loadInbox, refreshCount]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    capture('notifications_opened', { unread });
    loadInboxIfStale();
  };

  const markRead = (ids?: string[]) => {
    const now = new Date();
    setNotifications(
      (current) => current?.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)) ?? null,
    );
    setUnread((count) => (ids ? Math.max(0, count - ids.length) : 0));
    void markNotificationsReadAction(ids).catch(() => refreshCount());
  };

  const handleSelect = (notification: InboxNotification) => {
    if (!notification.readAt) markRead([notification.id]);
    capture('notification_clicked', { type: notification.type });
    setOpen(false);
    if (notification.url) router.push(notification.url);
  };

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* 32px on desktop; on touch screens an invisible margin brings the target to 44px. */}
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onPointerEnter={loadInboxIfStale}
            onFocus={loadInboxIfStale}
            className="relative active:scale-[0.96] pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
          />
        }
      >
        <Bell />
        {/* A ring in the header's own colour cuts the count out of the bell. */}
        <UnreadCount count={unread} className="absolute -top-0.5 -right-0.5 ring-2 ring-background" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            Notifications
            <UnreadCount count={unread} />
          </span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => markRead()}>
              <CheckCheck data-icon="inline-start" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain">
          {notifications === null ? (
            <div className="divide-y" aria-busy>
              <NotificationItemSkeleton />
              <NotificationItemSkeleton />
              <NotificationItemSkeleton />
            </div>
          ) : notifications.length === 0 ? (
            <Empty className="gap-3 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellOff />
                </EmptyMedia>
                <EmptyTitle>You are all caught up</EmptyTitle>
                <EmptyDescription>Assignments, reviews and deadlines will show up here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onSelect={handleSelect} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            nativeButton={false}
            render={<Link href="/notifications" onClick={() => setOpen(false)} />}
          >
            View all notifications
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
