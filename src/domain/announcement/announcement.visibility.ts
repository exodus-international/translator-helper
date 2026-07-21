// Pure visibility rules for announcements — no I/O, no framework types.
// An announcement is visible when it is active, not expired, and not
// dismissed by the current user. At most one BANNER and one MODAL are
// shown at a time, newest first; dismissing reveals the next-newest.

export interface AnnouncementForVisibility {
  id: string;
  type: 'BANNER' | 'MODAL';
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface VisibleAnnouncements<T> {
  banner: T | null;
  modal: T | null;
}

export function selectVisibleAnnouncements<T extends AnnouncementForVisibility>(
  announcements: readonly T[],
  dismissedIds: ReadonlySet<string>,
  now: Date,
): VisibleAnnouncements<T> {
  const eligible = announcements
    .filter(
      (a) =>
        a.isActive &&
        !dismissedIds.has(a.id) &&
        (a.expiresAt === null || a.expiresAt.getTime() > now.getTime()),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    banner: eligible.find((a) => a.type === 'BANNER') ?? null,
    modal: eligible.find((a) => a.type === 'MODAL') ?? null,
  };
}
