import prisma from '@/lib/db';
import { AudioProvider, DocumentStatus, ProjectRole } from '@/generated/prisma/enums';
import type { LanguageDependents } from './language-delete';

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
  /** DEPLOYED versions over all versions, the definition the Statistics tab calls progress. */
  deployedCount: number;
  versionCount: number;
}

/**
 * The index answers "which language will fail, and how far along is it" in one
 * screen, which no page does today. Three queries rather than one per language:
 * the rows, their managers, and one grouped count over DocumentVersion --
 * @@index([languageId]) covers the grouping.
 */
export async function listLanguagesForIndex(): Promise<LanguageListRow[]> {
  const [languages, managers, versionCounts] = await Promise.all([
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
    prisma.documentVersion.groupBy({
      by: ['languageId', 'status'],
      _count: { _all: true },
    }),
  ]);

  const managerNames = new Map<string, string[]>();
  for (const manager of managers) {
    managerNames.set(manager.languageId, [...(managerNames.get(manager.languageId) ?? []), manager.user.name]);
  }

  const totals = new Map<string, { deployed: number; all: number }>();
  for (const group of versionCounts) {
    const current = totals.get(group.languageId) ?? { deployed: 0, all: 0 };
    current.all += group._count._all;
    if (group.status === DocumentStatus.DEPLOYED) {
      current.deployed += group._count._all;
    }
    totals.set(group.languageId, current);
  }

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
    deployedCount: totals.get(language.id)?.deployed ?? 0,
    versionCount: totals.get(language.id)?.all ?? 0,
  }));
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
