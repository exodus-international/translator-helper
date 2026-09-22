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
 * forever or drag it down forever. They are not listed either -- a list of
 * finished projects only grows, and each entry matters less as it ages -- but
 * everything they hold is counted in the lifetime totals, so finished work is
 * summarised rather than dropped.
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

/** Everything this language has ever done, finished projects included. */
export interface LanguageLifetime {
  projects: number;
  completedProjects: number;
  documents: number;
  /** Approved or deployed: the translation work itself is finished. */
  translated: number;
  translatedPercent: number;
  deployed: number;
}

export interface LanguageProgress {
  /** Active projects only. */
  deployed: number;
  documents: number;
  percent: number;
  byStatus: Record<DocumentStatus, number>;
  projects: LanguageProjectProgress[];
  lifetime: LanguageLifetime;
  /**
   * Documents in ACTIVE projects with no version in this language. Counted as
   * pending above, and reported separately because it means a document escaped
   * both seeding paths. Scoped like the figures beside it, so the warning
   * cannot describe work the headline never counted.
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
  let lifetimeTranslated = 0;
  let lifetimeDeployed = 0;

  for (const row of rows) {
    // A document nobody has started is untranslated work, not absent work.
    const status = row.status ?? DocumentStatus.PENDING_TRANSLATION;
    const isActive = row.projectStatus === SourceProjectStatus.ACTIVE;

    // Scoped to active projects like everything it is shown beside: the page
    // says these documents "count as untranslated above", and one in a
    // completed project does not appear above at all.
    if (row.status === null && isActive) {
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
      lifetimeDeployed += 1;
    }
    if (status === DocumentStatus.APPROVED || status === DocumentStatus.DEPLOYED) {
      lifetimeTranslated += 1;
    }
    projects.set(row.projectId, project);

    if (isActive) {
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
    lifetime: {
      projects: all.length,
      completedProjects: all.filter((project) => project.status === SourceProjectStatus.COMPLETE).length,
      documents: rows.length,
      translated: lifetimeTranslated,
      translatedPercent: percentage(lifetimeTranslated, rows.length),
      deployed: lifetimeDeployed,
    },
    missingVersions,
  };
}

function percentage(part: number, total: number): number {
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

// ─── Building the rows ───────────────────────────────────────

export interface LanguageRowInputs {
  /** Which language is translated in which project. */
  translationProjects: { languageId: string; sourceProject: { id: string; name: string; status: SourceProjectStatus } }[];
  documents: { id: string; sourceProjectId: string | null }[];
  versions: { documentId: string; languageId: string; status: DocumentStatus }[];
}

/**
 * One row per document a language is expected to translate, keyed by language.
 *
 * The index needs this for every language at once and the overview for one, but
 * they must mean the same thing: a language is expected to translate a document
 * when it has a translation project on that document's source project, and the
 * document's status in that language is whatever version exists, or none.
 *
 * Written apart from the queries so it can be tested without a database --
 * the index used to restate this in SQL aggregates, which is how it came to
 * disagree with the overview.
 */
export function buildLanguageDocumentRows({
  translationProjects,
  documents,
  versions,
}: LanguageRowInputs): Map<string, LanguageDocumentRow[]> {
  const documentsByProject = new Map<string, string[]>();
  for (const document of documents) {
    if (!document.sourceProjectId) continue;
    documentsByProject.set(document.sourceProjectId, [
      ...(documentsByProject.get(document.sourceProjectId) ?? []),
      document.id,
    ]);
  }

  const statusByDocumentAndLanguage = new Map<string, DocumentStatus>();
  for (const version of versions) {
    statusByDocumentAndLanguage.set(`${version.documentId}:${version.languageId}`, version.status);
  }

  const rows = new Map<string, LanguageDocumentRow[]>();
  for (const { languageId, sourceProject } of translationProjects) {
    const forLanguage = rows.get(languageId) ?? [];

    for (const documentId of documentsByProject.get(sourceProject.id) ?? []) {
      forLanguage.push({
        projectId: sourceProject.id,
        projectName: sourceProject.name,
        projectStatus: sourceProject.status,
        status: statusByDocumentAndLanguage.get(`${documentId}:${languageId}`) ?? null,
      });
    }

    rows.set(languageId, forLanguage);
  }

  return rows;
}
