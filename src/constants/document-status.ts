import { DocumentStatus } from '@prisma/client';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Circle, Clock3, PenLine, Rocket } from 'lucide-react';

export type DocumentStatusKey = DocumentStatus | 'NO_STATUS';

export interface DocumentStatusConfig {
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
      textClass: 'text-gray-600',
      indicatorClass: '!border-gray-500 !bg-gray-500 !text-white',
      indicatorInactiveClass: '!border-gray-200 !bg-gray-50 !text-gray-400',
      badgeClass: 'border border-gray-200 bg-gray-50 text-gray-700',
    },
  },
  [DocumentStatus.IN_PROGRESS]: {
    status: DocumentStatus.IN_PROGRESS,
    name: 'Translations in Progress',
    icon: PenLine,
    color: {
      hex: '#0063ed',
      textClass: 'text-blue-800',
      indicatorClass: '!border-blue-800 !bg-blue-800 !text-white',
      indicatorInactiveClass: '!border-blue-200 !bg-blue-50 !text-blue-400',
      badgeClass: 'border border-blue-200 bg-blue-50 text-blue-700',
    },
  },
  [DocumentStatus.PENDING_REVIEW]: {
    status: DocumentStatus.PENDING_REVIEW,
    name: 'Texts in Review',
    icon: Clock3,
    color: {
      hex: '#FACC15',
      textClass: 'text-yellow-600',
      indicatorClass: '!border-yellow-500 !bg-yellow-500 !text-white',
      indicatorInactiveClass: '!border-yellow-200 !bg-yellow-50 !text-yellow-400',
      badgeClass: 'border border-yellow-200 bg-yellow-50 text-yellow-700',
    },
  },
  [DocumentStatus.APPROVED]: {
    status: DocumentStatus.APPROVED,
    name: 'Approved Texts',
    icon: CheckCircle2,
    color: {
      hex: '#10B981',
      textClass: 'text-emerald-600',
      indicatorClass: '!border-emerald-500 !bg-emerald-500 !text-white',
      indicatorInactiveClass: '!border-emerald-200 !bg-emerald-50 !text-emerald-400',
      badgeClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    },
  },
  [DocumentStatus.DEPLOYED]: {
    status: DocumentStatus.DEPLOYED,
    name: 'Deployed Texts',
    icon: Rocket,
    color: {
      hex: '#8B5CF6',
      textClass: 'text-violet-600',
      indicatorClass: '!border-violet-500 !bg-violet-500 !text-white',
      indicatorInactiveClass: '!border-violet-200 !bg-violet-50 !text-violet-400',
      badgeClass: 'border border-violet-200 bg-violet-50 text-violet-700',
    },
  },
};

const NO_STATUS_CONFIG: DocumentStatusConfig = {
  status: 'NO_STATUS',
  name: 'No Status',
  icon: Circle,
  color: {
    hex: '#9CA3AF',
    textClass: 'text-gray-400',
    indicatorClass: 'border-gray-400 bg-gray-400 text-white',
    indicatorInactiveClass: 'border-gray-200 bg-gray-50 text-gray-400',
    badgeClass: 'border border-gray-200 bg-gray-50 text-gray-600',
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

export function getDocumentStatusByStep(step: number): DocumentStatus | null {
  if (step < 1 || step > DOCUMENT_STATUS_SEQUENCE.length) {
    return null;
  }
  return DOCUMENT_STATUS_SEQUENCE[step - 1];
}

export function getStepForDocumentStatus(status?: DocumentStatus | DocumentStatusKey | null): number {
  if (!status || status === 'NO_STATUS') {
    return 1;
  }

  return STATUS_STEP_INDEX[status] ?? 1;
}

export const NO_STATUS = NO_STATUS_CONFIG;
