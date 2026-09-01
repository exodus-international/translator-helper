import { DocumentType } from '@prisma/client';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, Compass, FileCog, Newspaper, Users } from 'lucide-react';

interface DocumentTypeConfig {
  type: DocumentType;
  /**
   * Human-readable name shown in badges, filters and form selects
   */
  name: string;
  icon: LucideIcon;
  color: {
    /**
     * Tailwind classes for badges or chips
     */
    badgeClass: string;
    /**
     * Tailwind classes for a standalone icon
     */
    textClass: string;
  };
}

/**
 * Display order for type pickers and filters. Keep it stable: users scan these
 * lists by position.
 */
export const DOCUMENT_TYPE_SEQUENCE: DocumentType[] = [
  DocumentType.DAY,
  DocumentType.FIELD_GUIDE,
  DocumentType.DAILY_CONTENT,
  DocumentType.ROOT_FILE,
  DocumentType.MEETING,
];

export const DOCUMENT_TYPE_CONFIGS: Record<DocumentType, DocumentTypeConfig> = {
  [DocumentType.DAY]: {
    type: DocumentType.DAY,
    name: 'Day',
    icon: CalendarDays,
    color: {
      badgeClass: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
      textClass: 'text-indigo-600',
    },
  },
  [DocumentType.FIELD_GUIDE]: {
    type: DocumentType.FIELD_GUIDE,
    name: 'Field Guide',
    icon: Compass,
    color: {
      badgeClass: 'border border-amber-200 bg-amber-50 text-amber-700',
      textClass: 'text-amber-600',
    },
  },
  [DocumentType.DAILY_CONTENT]: {
    type: DocumentType.DAILY_CONTENT,
    name: 'Daily Content',
    icon: Newspaper,
    color: {
      badgeClass: 'border border-sky-200 bg-sky-50 text-sky-700',
      textClass: 'text-sky-600',
    },
  },
  [DocumentType.ROOT_FILE]: {
    type: DocumentType.ROOT_FILE,
    name: 'Root File',
    icon: FileCog,
    color: {
      badgeClass: 'border border-slate-200 bg-slate-50 text-slate-700',
      textClass: 'text-slate-600',
    },
  },
  [DocumentType.MEETING]: {
    type: DocumentType.MEETING,
    name: 'Meeting',
    icon: Users,
    color: {
      badgeClass: 'border border-rose-200 bg-rose-50 text-rose-700',
      textClass: 'text-rose-600',
    },
  },
};

export function getDocumentTypeConfig(type: DocumentType): DocumentTypeConfig {
  return DOCUMENT_TYPE_CONFIGS[type];
}
