import prisma from '@/lib/db';
import { AudioProvider, DocumentStatus, ProjectRole, SourceProjectStatus } from '@/generated/prisma/enums';
import type { LanguageDependents } from './language-delete';
import { rollUpLanguageProgress, percentage, type LanguageDocumentRow, type LanguageProgress } from './language-progress';

/** Everything a document can be translated *into*, which is every language but the source. */
export async function listTargetLanguages() {
  return prisma.language.findMany({
    where: {
      isSource: false,
    },
    orderBy: {
      name: 'asc',
    },
  });
}

export async function getLanguageById(id: string) {
  return prisma.language.findUnique({
    where: { id },
  });
}

export async function getLanguageByCode(code: string) {
  return prisma.language.findUnique({
    where: { code },
  });
}

export async function createLanguage(code: string, name: string, branchName: string) {
  return prisma.language.create({
    data: {
      code,
      name,
      branchName,
    },
  });
}

export async function updateLanguageSettings(
  id: string,
  data: { name: string; branchName: string | null; audioProvider: AudioProvider | null; audioVoice: string | null },
) {
  return prisma.language.update({ where: { id }, data });
}

export async function updateLanguageInstructions(id: string, translationInstructions: string | null) {
  return prisma.language.update({
    where: { id },
    data: { translationInstructions },
  });
}

export async function deleteLanguage(id: string) {
  return prisma.language.delete({
    where: { id },
  });
}

// ─── The index ───────────────────────────────────────────────

export interface LanguageListRow {
  id: string;
  code: string;
  name: string;
  isSource: boolean;
  branchName: string | null;
  audioVoice: string | null;
  translationInstructions: string | null;
  memberCount: number;
  projectCount: number;
  managerNames: string[];
  /** DEPLOYED documents over every document in the language's active projects. */
  deployedCount: number;
  documentCount: number;
  percent: number;
}

/**
 * The index answers "which language will fail, and how far along is it" in one
 * screen, which no page does today.
 *
 * Progress counts DEPLOYED documents over every document in the language's
 * active projects -- the denominator `rollUpLanguageProgress` and the project
 * Statistics tab both use. Counting versions instead was cheaper and wrong: a
 * document nobody had started simply left the denominator, so a language read
 * further along than it was.
 */
export async function listLanguagesForIndex(): Promise<LanguageListRow[]> {
  const [languages, managers, documentTotals, deployedCounts] = await Promise.all([
    prisma.language.findMany({
      // Targets first, the source language last: it is context, not work.
      orderBy: [{ isSource: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { users: true, translationProjects: true } } },
    }),
    prisma.userLanguage.findMany({
      where: { role: ProjectRole.PROJECT_MANAGER },
      select: { languageId: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    // Every document in an active project the language is translated in.
    prisma.translationProject.findMany({
      where: { sourceProject: { status: SourceProjectStatus.ACTIVE } },
      select: { languageId: true, sourceProject: { select: { _count: { select: { documents: true } } } } },
    }),
    prisma.documentVersion.groupBy({
      by: ['languageId'],
      where: {
        status: DocumentStatus.DEPLOYED,
        document: { sourceProject: { status: SourceProjectStatus.ACTIVE } },
      },
      _count: { _all: true },
    }),
  ]);

  const managerNames = new Map<string, string[]>();
  for (const manager of managers) {
    managerNames.set(manager.languageId, [...(managerNames.get(manager.languageId) ?? []), manager.user.name]);
  }

  const documents = new Map<string, number>();
  for (const translationProject of documentTotals) {
    const current = documents.get(translationProject.languageId) ?? 0;
    documents.set(translationProject.languageId, current + translationProject.sourceProject._count.documents);
  }

  const deployed = new Map(deployedCounts.map((group) => [group.languageId, group._count._all]));

  return languages.map((language) => ({
    id: language.id,
    code: language.code,
    name: language.name,
    isSource: language.isSource,
    branchName: language.branchName,
    audioVoice: language.audioVoice,
    translationInstructions: language.translationInstructions,
    memberCount: language._count.users,
    projectCount: language._count.translationProjects,
    managerNames: managerNames.get(language.id) ?? [],
    deployedCount: deployed.get(language.id) ?? 0,
    documentCount: documents.get(language.id) ?? 0,
    percent: percentage(deployed.get(language.id) ?? 0, documents.get(language.id) ?? 0),
  }));
}

/**
 * One language's work across every project it appears in. The rows are one per
 * document, with the version's status when there is one -- the roll-up decides
 * what that means.
 */
export async function getLanguageProgress(
  languageId: string,
): Promise<LanguageProgress & { lastDeployAt: Date | null }> {
  const [documents, lastDeploy] = await Promise.all([
    prisma.document.findMany({
      where: { sourceProject: { translationProjects: { some: { languageId } } } },
      select: {
        sourceProject: { select: { id: true, name: true, status: true } },
        versions: { where: { languageId }, select: { status: true }, take: 1 },
      },
    }),
    // A real timestamp for "last deploy": a commit is written the moment a
    // version reaches the content repository, where a status has no history.
    prisma.gitHubCommit.findFirst({
      where: { documentVersion: { languageId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const rows: LanguageDocumentRow[] = documents.flatMap((document) =>
    document.sourceProject
      ? [
          {
            projectId: document.sourceProject.id,
            projectName: document.sourceProject.name,
            projectStatus: document.sourceProject.status,
            status: document.versions[0]?.status ?? null,
          },
        ]
      : [],
  );

  return { ...rollUpLanguageProgress(rows), lastDeployAt: lastDeploy?.createdAt ?? null };
}

/** The manager names and member count one language's settings page shows. */
export async function getLanguageMemberSummary(languageId: string) {
  const members = await prisma.userLanguage.findMany({
    where: { languageId },
    select: { role: true, user: { select: { name: true } } },
    orderBy: { user: { name: 'asc' } },
  });

  return {
    memberCount: members.length,
    managerNames: members.filter((m) => m.role === ProjectRole.PROJECT_MANAGER).map((m) => m.user.name),
  };
}

/** Exactly what `prisma.language.delete` would cascade into. */
export async function countLanguageDependents(languageId: string): Promise<LanguageDependents> {
  const [versions, translationProjects, memberships, invitations] = await Promise.all([
    prisma.documentVersion.count({ where: { languageId } }),
    prisma.translationProject.count({ where: { languageId } }),
    prisma.userLanguage.count({ where: { languageId } }),
    prisma.invitationLanguage.count({ where: { languageId } }),
  ]);

  return { versions, translationProjects, memberships, invitations };
}
