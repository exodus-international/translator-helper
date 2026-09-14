import { DocumentStatus } from '@/generated/prisma/enums';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Circle, Clock3, PenLine, Rocket } from 'lucide-react';

// fallow-ignore-next-line unused-type
export type DocumentStatusKey = DocumentStatus | 'NO_STATUS';

interface DocumentStatusConfig {
  status: DocumentStatusKey;
  name: string;
  icon: LucideIcon;
  color: {
    /**
     * Hex value used for Kanban columns or charts
     */
    hex: string;
    /**
     * Tailwind classes for text/icon color
     */
    textClass: string;
    /**
     * Tailwind classes for the Stepper indicator background/text/border (completed state)
     */
    indicatorClass: string;
    /**
     * Tailwind classes for the Stepper indicator background/text/border (inactive/todo state)
     */
    indicatorInactiveClass: string;
    /**
     * Tailwind classes for badges or chips
     */
    badgeClass: string;
  };
}

export const DOCUMENT_STATUS_SEQUENCE: DocumentStatus[] = [
  DocumentStatus.PENDING_TRANSLATION,
  DocumentStatus.IN_PROGRESS,
  DocumentStatus.PENDING_REVIEW,
  DocumentStatus.APPROVED,
  DocumentStatus.DEPLOYED,
];

export const DOCUMENT_STATUS_CONFIGS: Record<DocumentStatus, DocumentStatusConfig> = {
  [DocumentStatus.PENDING_TRANSLATION]: {
    status: DocumentStatus.PENDING_TRANSLATION,
    name: 'TODO',
    icon: AlertCircle,
    color: {
      hex: '#BABABA',
      textClass: 'text-muted-foreground',
      indicatorClass: '!border-muted-foreground !bg-muted-foreground !text-background',
      indicatorInactiveClass: '!border-border !bg-muted !text-muted-foreground',
      badgeClass: 'border border-border bg-muted text-muted-foreground',
    },
  },
  [DocumentStatus.IN_PROGRESS]: {
    status: DocumentStatus.IN_PROGRESS,
    name: 'Translations in Progress',
    icon: PenLine,
    color: {
      hex: '#0063ed',
      textClass: 'text-hue-blue',
      indicatorClass: '!border-hue-blue !bg-hue-blue !text-background',
      indicatorInactiveClass: '!border-hue-blue/25 !bg-hue-blue/10 !text-hue-blue/60',
      badgeClass: 'border border-hue-blue/25 bg-hue-blue/10 text-hue-blue',
    },
  },
  [DocumentStatus.PENDING_REVIEW]: {
    status: DocumentStatus.PENDING_REVIEW,
    name: 'Texts in Review',
    icon: Clock3,
    color: {
      hex: '#FACC15',
      textClass: 'text-hue-amber',
      indicatorClass: '!border-hue-amber !bg-hue-amber !text-background',
      indicatorInactiveClass: '!border-hue-amber/25 !bg-hue-amber/10 !text-hue-amber/60',
      badgeClass: 'border border-hue-amber/25 bg-hue-amber/10 text-hue-amber',
    },
  },
  [DocumentStatus.APPROVED]: {
    status: DocumentStatus.APPROVED,
    name: 'Approved Texts',
    icon: CheckCircle2,
    color: {
      hex: '#10B981',
      textClass: 'text-hue-emerald',
      indicatorClass: '!border-hue-emerald !bg-hue-emerald !text-background',
      indicatorInactiveClass: '!border-hue-emerald/25 !bg-hue-emerald/10 !text-hue-emerald/60',
      badgeClass: 'border border-hue-emerald/25 bg-hue-emerald/10 text-hue-emerald',
    },
  },
  [DocumentStatus.DEPLOYED]: {
    status: DocumentStatus.DEPLOYED,
    name: 'Deployed Texts',
    icon: Rocket,
    color: {
      hex: '#8B5CF6',
      textClass: 'text-hue-violet',
      indicatorClass: '!border-hue-violet !bg-hue-violet !text-background',
      indicatorInactiveClass: '!border-hue-violet/25 !bg-hue-violet/10 !text-hue-violet/60',
      badgeClass: 'border border-hue-violet/25 bg-hue-violet/10 text-hue-violet',
    },
  },
};

const NO_STATUS_CONFIG: DocumentStatusConfig = {
  status: 'NO_STATUS',
  name: 'No Status',
  icon: Circle,
  color: {
    hex: '#9CA3AF',
    textClass: 'text-muted-foreground',
    indicatorClass: 'border-muted-foreground bg-muted-foreground text-background',
    indicatorInactiveClass: 'border-border bg-muted text-muted-foreground',
    badgeClass: 'border border-border bg-muted text-muted-foreground',
  },
};

const STATUS_STEP_INDEX = DOCUMENT_STATUS_SEQUENCE.reduce<Record<DocumentStatus, number>>(
  (acc, status, index) => {
    acc[status] = index + 1;
    return acc;
  },
  {} as Record<DocumentStatus, number>,
);

export function getDocumentStatusConfig(status?: DocumentStatus | DocumentStatusKey | null): DocumentStatusConfig {
  if (!status || status === 'NO_STATUS') {
    return NO_STATUS_CONFIG;
  }

  return DOCUMENT_STATUS_CONFIGS[status] ?? NO_STATUS_CONFIG;
}

export function getStepForDocumentStatus(status?: DocumentStatus | DocumentStatusKey | null): number {
  if (!status || status === 'NO_STATUS') {
    return 1;
  }

  return STATUS_STEP_INDEX[status] ?? 1;
}

export const NO_STATUS = NO_STATUS_CONFIG;
