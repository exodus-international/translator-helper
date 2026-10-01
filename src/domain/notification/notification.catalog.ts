import { DocumentStatus, NotificationType } from '@/generated/prisma/enums';

/**
 * How loudly a notification speaks, loudest first. Overdue work must not be
 * skimmed past, work due soon should catch the eye, things to act on are
 * plain, and the rest is quiet. The email, the bell and the notifications page
 * all read it.
 */
type NotificationTone = 'overdue' | 'soon' | 'action' | 'info';

export const TONE_ORDER: NotificationTone[] = ['overdue', 'soon', 'action', 'info'];

interface NotificationTypeInfo {
  /** How the preferences screen names the type. */
  label: string;
  /** The short tag on the notification itself. */
  tag: string;
  tone: NotificationTone;
  /**
   * The document status the notification is about, if any. Its tag and icon
   * take that status's colours, so "Ready for review" looks like the In Review
   * badge everywhere else in the app.
   */
  status?: DocumentStatus;
  description: string;
  /** Whether it is emailed when the user has not chosen either way. */
  emailByDefault: boolean;
}

/**
 * Every notification type, in the order the preferences screen lists them.
 * Work that lands on you, or is about to be late, is emailed by default;
 * news about work you already know about stays in the app unless asked for.
 */
export const NOTIFICATION_CATALOG: Record<NotificationType, NotificationTypeInfo> = {
  [NotificationType.ASSIGNED_TRANSLATOR]: {
    label: 'Assigned to translate',
    tag: 'New assignment',
    tone: 'action',
    status: DocumentStatus.IN_PROGRESS,
    description: 'A document is assigned to you for translation.',
    emailByDefault: true,
  },
  [NotificationType.ASSIGNED_REVIEWER]: {
    label: 'Assigned to review',
    tag: 'Review assignment',
    tone: 'action',
    status: DocumentStatus.PENDING_REVIEW,
    description: 'You are made the reviewer of a translation.',
    emailByDefault: true,
  },
  [NotificationType.UNASSIGNED]: {
    label: 'Unassigned',
    tag: 'Unassigned',
    tone: 'info',
    description: 'A document you were translating or reviewing is given to someone else.',
    emailByDefault: true,
  },
  [NotificationType.REVIEW_REQUESTED]: {
    label: 'Ready for review',
    tag: 'Ready for review',
    tone: 'action',
    status: DocumentStatus.PENDING_REVIEW,
    description: 'A translation you review is submitted, or one without a reviewer needs one.',
    emailByDefault: true,
  },
  [NotificationType.DEADLINE_CHANGED]: {
    label: 'Deadline changed',
    tag: 'Deadline changed',
    tone: 'info',
    description: 'The due date of your translation or review moves.',
    emailByDefault: true,
  },
  [NotificationType.DEADLINE_APPROACHING]: {
    label: 'Deadline approaching',
    tag: 'Due soon',
    tone: 'soon',
    description: 'Three days and one day before your translation or review is due.',
    emailByDefault: true,
  },
  [NotificationType.DEADLINE_PASSED]: {
    label: 'Deadline passed',
    tag: 'Overdue',
    tone: 'overdue',
    description: 'Your translation or review is overdue.',
    emailByDefault: true,
  },
  [NotificationType.DEADLINE_ESCALATION]: {
    label: 'Overdue in your team',
    tag: 'Overdue on your team',
    tone: 'overdue',
    description: 'Work you assigned, or manage, is a day or more overdue.',
    emailByDefault: true,
  },
  [NotificationType.CHANGES_REQUESTED]: {
    label: 'Changes requested',
    tag: 'Changes requested',
    tone: 'action',
    status: DocumentStatus.IN_PROGRESS,
    description: 'A reviewer sends your translation back.',
    emailByDefault: true,
  },
  [NotificationType.TRANSLATION_APPROVED]: {
    label: 'Approved',
    tag: 'Approved',
    tone: 'info',
    status: DocumentStatus.APPROVED,
    description: 'Your translation is approved.',
    emailByDefault: false,
  },
  [NotificationType.SUGGESTION_ADDED]: {
    label: 'New suggestion',
    tag: 'Suggestion',
    tone: 'info',
    description: 'Someone leaves a suggestion or comment on your translation.',
    emailByDefault: false,
  },
  [NotificationType.SUGGESTION_REPLY]: {
    label: 'Reply in a thread',
    tag: 'Reply',
    tone: 'info',
    description: 'Someone replies in a suggestion thread you are part of.',
    emailByDefault: false,
  },
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_CATALOG) as NotificationType[];

/** The user's choice where there is one, the type's default where there is not. */
export function wantsEmail(type: NotificationType, preferences: Map<NotificationType, boolean>): boolean {
  return preferences.get(type) ?? NOTIFICATION_CATALOG[type].emailByDefault;
}
