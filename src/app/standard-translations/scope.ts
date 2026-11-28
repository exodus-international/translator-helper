import { SourceProjectStatus } from '@/generated/prisma/enums';
import type { StandardTranslationsPage } from '@/domain/standard-translation/standard-translation.repository';
import { defaultSelection, type ScopeSelection } from '@/domain/standard-translation/standard-translation.types';

/**
 * The Scope filter's selection and how it travels in the URL, as
 * `parseScope` reads it back: `?scope=general,<id>,…`,
 * absent for the default selection. Pure, so the round trip is tested without
 * a page.
 */

type ScopeProject = StandardTranslationsPage['scopes']['projects'][number];

/** The token the schema reads as "general entries". */
const GENERAL_TOKEN = 'general';

/**
 * The URL can't carry an empty `scope=`: the list helpers drop empty values,
 * which would bring the default back. Any token the schema doesn't know is
 * dropped by it, so this one reads as "nothing selected".
 */
const NOTHING_TOKEN = 'none';

const isActive = (project: ScopeProject) => project.status === SourceProjectStatus.ACTIVE;
const isComplete = (project: ScopeProject) => project.status === SourceProjectStatus.COMPLETE;

function sameSelection(a: ScopeSelection, b: ScopeSelection): boolean {
  const ids = new Set(a.projectIds);
  return (
    a.includeGeneral === b.includeGeneral &&
    ids.size === new Set(b.projectIds).size &&
    b.projectIds.every((id) => ids.has(id))
  );
}

/**
 * The `scope` search param for a selection: null for the default, so the
 * default stays out of the URL. Project ids follow the filter's order and
 * leave out ids of projects the language no longer has.
 */
export function scopeParam(selection: ScopeSelection, projects: ScopeProject[]): string | null {
  if (sameSelection(selection, defaultSelection(projects))) return null;
  const selected = new Set(selection.projectIds);
  const tokens = [
    ...(selection.includeGeneral ? [GENERAL_TOKEN] : []),
    ...projects.filter((project) => selected.has(project.id)).map((project) => project.id),
  ];
  return tokens.length > 0 ? tokens.join(',') : NOTHING_TOKEN;
}

export function toggleGeneral(selection: ScopeSelection): ScopeSelection {
  return { ...selection, includeGeneral: !selection.includeGeneral };
}

export function toggleProject(selection: ScopeSelection, projectId: string): ScopeSelection {
  const projectIds = selection.projectIds.includes(projectId)
    ? selection.projectIds.filter((id) => id !== projectId)
    : [...selection.projectIds, projectId];
  return { ...selection, projectIds };
}

/** "Show them": the selection plus every completed project. */
export function withCompletedProjects(selection: ScopeSelection, projects: ScopeProject[]): ScopeSelection {
  const projectIds = new Set(selection.projectIds);
  for (const project of projects.filter(isComplete)) projectIds.add(project.id);
  return { ...selection, projectIds: [...projectIds] };
}

/** The trigger's text after "Scope:", e.g. "All projects + active". */
export function scopeLabel(selection: ScopeSelection, projects: ScopeProject[]): string {
  const selected = new Set(selection.projectIds);
  const chosen = projects.filter((project) => selected.has(project.id));
  const active = projects.filter(isActive);
  const allActive = active.length > 0 && chosen.length === active.length && chosen.every(isActive);

  const parts: string[] = [];
  if (selection.includeGeneral) parts.push('All projects');
  if (allActive) parts.push(selection.includeGeneral ? 'active' : 'Active projects');
  else if (chosen.length === 1) parts.push(chosen[0].name);
  else if (chosen.length > 1) parts.push(`${chosen.length} projects`);

  return parts.length > 0 ? parts.join(' + ') : 'None';
}
