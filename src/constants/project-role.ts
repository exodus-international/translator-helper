import { ProjectRole } from '@/generated/prisma/enums';

/**
 * One role per person per language. The labels lived in three screens that each
 * edited the same table; they live here now that one screen does.
 *
 * The enum still says PROJECT_MANAGER, which it has not been since #150 made
 * membership language-scoped. Renaming the column is a migration touching every
 * role comparison, so the screens say what the role is and the database keeps
 * its old word for now.
 */
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  PROJECT_MANAGER: 'Language Manager',
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
