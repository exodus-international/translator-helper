'use client';

import { NotificationItem, UnreadCount } from '@/components/notification-item';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getNotificationPageAction, markNotificationsReadAction } from '@/domain/notification/notification.actions';
import type { InboxNotification } from '@/domain/notification/notification.repository';
import { capture } from '@/lib/analytics';
import { formatUnambiguousDate } from '@/lib/format';
import { useNotificationCount } from '@/lib/notification-count';
import { BellOff, CheckCheck, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SendEmailsNow } from './send-emails-now';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Filter = 'all' | 'unread';

interface Page {
  notifications: InboxNotification[];
  nextCursor: string | null;
  unread: number;
}

/** "Today", "Yesterday", or the date: the headings the list is grouped under. */
function dayLabel(value: Date | string, now = new Date()): string {
  const day = new Date(value);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return formatUnambiguousDate(day);
}

function groupByDay(notifications: InboxNotification[]) {
  const groups: { label: string; items: InboxNotification[] }[] = [];
  for (const notification of notifications) {
    const label = dayLabel(notification.createdAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(notification);
    else groups.push({ label, items: [notification] });
  }
  return groups;
}

/**
 * Everything the bell has room for and more: the whole history, filterable to
 * what is unread, a day at a time. Opening a notification marks it read and
 * goes to the document (and, for suggestions, the thread) it is about.
 */
export default function NotificationsClient({ initial, isAdmin }: { initial: Page; isAdmin: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [notifications, setNotifications] = useState(initial.notifications);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  // The shared count, so the header badge and user menu follow what is read here.
  const unread = useNotificationCount((state) => state.unread);
  const setUnread = useNotificationCount((state) => state.setUnread);

  useEffect(() => {
    setUnread(initial.unread);
  }, [initial.unread, setUnread]);
  const [loading, setLoading] = useState<'filter' | 'older' | null>(null);

  const load = async (next: Filter, cursor?: string) => {
    setLoading(cursor ? 'older' : 'filter');
    try {
      const page = await getNotificationPageAction({ cursor, unreadOnly: next === 'unread' });
      setNotifications((current) => (cursor ? [...current, ...page.notifications] : page.notifications));
      setNextCursor(page.nextCursor);
      setUnread(page.unread);
    } catch {
      toast.error('Could not load notifications');
    } finally {
      setLoading(null);
    }
  };

  const changeFilter = (next: Filter) => {
    setFilter(next);
    void load(next);
  };

  const markRead = (ids?: string[]) => {
    const now = new Date();
    setNotifications((current) =>
      current.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
    );
    setUnread((count) => (ids ? Math.max(0, count - ids.length) : 0));
    void markNotificationsReadAction(ids).catch(() => toast.error('Could not mark as read'));
  };

  const handleSelect = (notification: InboxNotification) => {
    if (!notification.readAt) markRead([notification.id]);
    capture('notification_clicked', { type: notification.type });
    if (notification.url) router.push(notification.url);
  };

  const groups = groupByDay(notifications);

  return (
    <>
      <PageHeader title="Notifications">
        {/* The unread count is on the tab, so the header needs no description. */}
        <div className="flex items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(value) => changeFilter(value as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">
                Unread
                <UnreadCount count={unread} />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" disabled={unread === 0} onClick={() => markRead()}>
            <CheckCheck data-icon="inline-start" />
            Mark all read
          </Button>
        </div>
      </PageHeader>

      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 transition-opacity duration-150 ease-out',
          // Switching tabs keeps the old list on screen, dimmed, instead of flashing empty.
          loading === 'filter' && 'opacity-60',
        )}
        aria-busy={loading !== null}
      >
        {notifications.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellOff />
              </EmptyMedia>
              <EmptyTitle>{filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}</EmptyTitle>
              <EmptyDescription>
                {filter === 'unread'
                  ? 'Everything here has been read.'
                  : 'Assignments, reviews, deadlines and suggestions on your work will show up here.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-labelledby={`day-${group.label}`}>
              <h2
                id={`day-${group.label}`}
                className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase tabular-nums"
              >
                {group.label}
              </h2>
              <Card className="gap-0 overflow-hidden p-0">
                <ul className="divide-y">
                  {group.items.map((notification) => (
                    <li key={notification.id}>
                      <NotificationItem notification={notification} onSelect={handleSelect} size="comfortable" />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}

        {nextCursor && (
          <div className="flex justify-center">
            <Button variant="outline" disabled={loading !== null} onClick={() => load(filter, nextCursor)}>
              {loading === 'older' ? 'Loading…' : 'Show older'}
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-balance text-muted-foreground">
          <Mail aria-hidden className="mr-1.5 inline size-4 align-[-3px]" />
          Email arrives once a day, at noon{'\u00a0'}CET.{' '}
          <Link
            href="/profile#notifications"
            className="font-medium whitespace-nowrap text-foreground underline-offset-4 hover:underline"
          >
            Choose which emails you get
          </Link>
        </p>
        {isAdmin && (
          <div className="-mt-4 flex justify-center">
            <SendEmailsNow />
          </div>
        )}
      </div>
    </>
  );
}
