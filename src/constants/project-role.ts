import { ProjectRole } from '@/generated/prisma/enums';

/**
 * One role per person per language. The labels lived in three screens that each
 * edited the same table; they live here now that one screen does.
 */
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_MANAGER: 'Project Manager',
  REVIEWER: 'Reviewer',
  EDITOR: 'Editor',
  TRANSLATOR: 'Translator',
};

/** Most-privileged first, which is the order a roster reads best in. */
export const PROJECT_ROLE_SEQUENCE = [
  ProjectRole.PROJECT_MANAGER,
  ProjectRole.REVIEWER,
  ProjectRole.EDITOR,
  ProjectRole.TRANSLATOR,
] as const;
