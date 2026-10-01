import { DocumentType } from '@/generated/prisma/enums';
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
      badgeClass: 'border border-hue-indigo/25 bg-hue-indigo/10 text-hue-indigo',
      textClass: 'text-hue-indigo',
    },
  },
  [DocumentType.FIELD_GUIDE]: {
    type: DocumentType.FIELD_GUIDE,
    name: 'Field Guide',
    icon: Compass,
    color: {
      badgeClass: 'border border-hue-amber/25 bg-hue-amber/10 text-hue-amber',
      textClass: 'text-hue-amber',
    },
  },
  [DocumentType.DAILY_CONTENT]: {
    type: DocumentType.DAILY_CONTENT,
    name: 'Daily Content',
    icon: Newspaper,
    color: {
      badgeClass: 'border border-hue-sky/25 bg-hue-sky/10 text-hue-sky',
      textClass: 'text-hue-sky',
    },
  },
  [DocumentType.ROOT_FILE]: {
    type: DocumentType.ROOT_FILE,
    name: 'Root File',
    icon: FileCog,
    color: {
      badgeClass: 'border border-border bg-muted text-muted-foreground',
      textClass: 'text-muted-foreground',
    },
  },
  [DocumentType.MEETING]: {
    type: DocumentType.MEETING,
    name: 'Meeting',
    icon: Users,
    color: {
      badgeClass: 'border border-hue-rose/25 bg-hue-rose/10 text-hue-rose',
      textClass: 'text-hue-rose',
    },
  },
};

export function getDocumentTypeConfig(type: DocumentType): DocumentTypeConfig {
  return DOCUMENT_TYPE_CONFIGS[type];
}
