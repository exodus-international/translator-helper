import { DocumentStatus, SourceProjectStatus } from '@/generated/prisma/enums';

/**
 * How far a language has got, rolled up across every project it appears in --
 * the question no screen answered, because progress was only ever shown for one
 * project and one language at a time.
 *
 * Two decisions are baked in here rather than left to each caller:
 *
 * The denominator is DOCUMENTS, not versions. `ProjectStatisticsTab` counts
 * documents in the project and treats a document with no version as pending, so
 * counting versions instead would make the same language read differently on
 * two screens. A version is normally created the moment a document is added or
 * a language joins a project, so the two agree anyway -- except where something
 * wrote around both paths, and there the document count is the honest one.
 *
 * Completed projects are excluded from the headline. "How is Croatian doing" is
 * a question about live work; a finished project would either inflate it
 * forever or drag it down forever. They are still returned, so the page can
 * show them below the line rather than silently dropping work that happened.
 */

export interface LanguageDocumentRow {
  projectId: string;
  projectName: string;
  projectStatus: SourceProjectStatus;
  /** Null when no version exists in this language yet. */
  status: DocumentStatus | null;
}

export interface LanguageProjectProgress {
  id: string;
  name: string;
  documents: number;
  deployed: number;
  percent: number;
}

export interface LanguageProgress {
  /** Active projects only. */
  deployed: number;
  documents: number;
  percent: number;
  byStatus: Record<DocumentStatus, number>;
  projects: LanguageProjectProgress[];
  completedProjects: LanguageProjectProgress[];
  /**
   * Documents with no version in this language. Counted as pending above; named
   * separately because it means a document escaped both seeding paths.
   */
  missingVersions: number;
}

const EMPTY_STATUS_COUNTS = (): Record<DocumentStatus, number> => ({
  [DocumentStatus.PENDING_TRANSLATION]: 0,
  [DocumentStatus.IN_PROGRESS]: 0,
  [DocumentStatus.PENDING_REVIEW]: 0,
  [DocumentStatus.APPROVED]: 0,
  [DocumentStatus.DEPLOYED]: 0,
});

export function rollUpLanguageProgress(rows: LanguageDocumentRow[]): LanguageProgress {
  const byStatus = EMPTY_STATUS_COUNTS();
  const projects = new Map<string, LanguageProjectProgress & { status: SourceProjectStatus }>();
  let missingVersions = 0;

  for (const row of rows) {
    // A document nobody has started is untranslated work, not absent work.
    const status = row.status ?? DocumentStatus.PENDING_TRANSLATION;
    if (row.status === null) {
      missingVersions += 1;
    }

    const project = projects.get(row.projectId) ?? {
      id: row.projectId,
      name: row.projectName,
      status: row.projectStatus,
      documents: 0,
      deployed: 0,
      percent: 0,
    };

    project.documents += 1;
    if (status === DocumentStatus.DEPLOYED) {
      project.deployed += 1;
    }
    projects.set(row.projectId, project);

    if (row.projectStatus === SourceProjectStatus.ACTIVE) {
      byStatus[status] += 1;
    }
  }

  const all = [...projects.values()].map((project) => ({
    ...project,
    percent: percentage(project.deployed, project.documents),
  }));

  const active = all.filter((project) => project.status === SourceProjectStatus.ACTIVE);
  const deployed = active.reduce((total, project) => total + project.deployed, 0);
  const documents = active.reduce((total, project) => total + project.documents, 0);

  return {
    deployed,
    documents,
    percent: percentage(deployed, documents),
    byStatus,
    projects: sortByName(active),
    completedProjects: sortByName(all.filter((project) => project.status === SourceProjectStatus.COMPLETE)),
    missingVersions,
  };
}

export function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function sortByName(projects: (LanguageProjectProgress & { status: SourceProjectStatus })[]): LanguageProjectProgress[] {
  return projects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => ({
      id: project.id,
      name: project.name,
      documents: project.documents,
      deployed: project.deployed,
      percent: project.percent,
    }));
}
