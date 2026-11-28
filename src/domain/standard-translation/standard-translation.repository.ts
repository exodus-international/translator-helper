import prisma from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import { DEFAULT_PAGE_SIZE } from '@/lib/list-params';
import { sourceKeyOf } from './match-form';
import {
  defaultSelection,
  type CreateStandardTranslationInput,
  type MoveKeep,
  type ScopeSelection,
  type UpdateStandardTranslationInput,
} from './standard-translation.types';

const rowSelect = {
  id: true,
  languageId: true,
  name: true,
  sourceText: true,
  targetText: true,
  fixedForm: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  sourceProject: { select: { id: true, name: true, status: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.StandardTranslationSelect;

export type StandardTranslationRow = Prisma.StandardTranslationGetPayload<{ select: typeof rowSelect }>;

type Client = Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma;

// ─── Reads ───────────────────────────────────────────────────

export async function getStandardTranslationById(id: string): Promise<StandardTranslationRow | null> {
  return prisma.standardTranslation.findUnique({ where: { id }, select: rowSelect });
}

/** What matching a document needs of an entry. */
const matchSelect = {
  id: true,
  name: true,
  sourceText: true,
  sourceKey: true,
  targetText: true,
  fixedForm: true,
  sourceProjectId: true,
} satisfies Prisma.StandardTranslationSelect;

export type StandardTranslationMatch = Prisma.StandardTranslationGetPayload<{ select: typeof matchSelect }>;

/**
 * The entries a document in the language can use: the general ones, and its
 * own project's when it has one. Another project's entries never reach it,
 * which is also why a completed project's entries need no status of their own.
 */
export async function listEntriesForTranslation(
  languageId: string,
  sourceProjectId: string | null,
): Promise<StandardTranslationMatch[]> {
  return prisma.standardTranslation.findMany({
    where: {
      languageId,
      OR: [{ sourceProjectId: null }, ...(sourceProjectId ? [{ sourceProjectId }] : [])],
    },
    select: matchSelect,
    orderBy: { id: 'asc' },
  });
}

/** A project of the language, as the Scope filter lists it. */
interface ScopeProject {
  id: string;
  name: string;
  status: SourceProjectStatus;
  count: number;
}

export interface StandardTranslationsPage {
  rows: StandardTranslationRow[];
  /** Entries in the selection that match the search, across every page. */
  total: number;
  /** The selection the rows were read with: the default when none was asked for. */
  selection: ScopeSelection;
  /** Entries of completed projects that match the search but are left out of the selection. */
  hiddenCompletedCount: number;
  /** Entries per scope that match the search, whatever the selection. */
  scopes: { general: number; projects: ScopeProject[] };
}

function searchWhere(q: string): Prisma.StandardTranslationWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { sourceText: { contains: q, mode: 'insensitive' } },
      { targetText: { contains: q, mode: 'insensitive' } },
    ],
  };
}

/**
 * The entries a selection shows. An empty selection shows none, said with an
 * `in: []` that matches nothing: Prisma drops an empty `OR`, which would show
 * them all.
 */
function selectionWhere(selection: ScopeSelection): Prisma.StandardTranslationWhereInput {
  const scopes: Prisma.StandardTranslationWhereInput[] = [
    ...(selection.includeGeneral ? [{ sourceProjectId: null }] : []),
    ...(selection.projectIds.length > 0 ? [{ sourceProjectId: { in: selection.projectIds } }] : []),
  ];
  return scopes.length > 0 ? { OR: scopes } : { id: { in: [] } };
}

/**
 * The projects an entry of the language can belong to: those translated into
 * it. A translation project only goes with its source project or language,
 * and their entries go with it, so no entry outlives its project's.
 */
async function listScopeProjects(languageId: string) {
  return prisma.sourceProject.findMany({
    where: {
      translationProjects: { some: { languageId } },
    },
    select: { id: true, name: true, status: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

/**
 * One page of a language's dictionary, with everything the page's Scope filter
 * needs. Without a selection it shows general entries and active projects:
 * completed projects are hidden by default, and counted, so the page can say
 * how many entries it is not showing.
 *
 * Ordered by name with unnamed entries last, then by source.
 */
export async function listStandardTranslations(params: {
  languageId: string;
  q: string;
  page: number;
  selection: ScopeSelection | null;
}): Promise<StandardTranslationsPage> {
  const { languageId, q, page } = params;
  const matching: Prisma.StandardTranslationWhereInput = { languageId, ...searchWhere(q) };

  const [projects, counts] = await Promise.all([
    listScopeProjects(languageId),
    prisma.standardTranslation.groupBy({ by: ['sourceProjectId'], where: matching, _count: { _all: true } }),
  ]);

  const countOf = new Map(counts.map((group) => [group.sourceProjectId, group._count._all]));
  const scopes = {
    general: countOf.get(null) ?? 0,
    projects: projects.map((project) => ({ ...project, count: countOf.get(project.id) ?? 0 })),
  };

  const selection = params.selection ?? defaultSelection(projects);
  const selected = new Set(selection.projectIds);

  const total =
    (selection.includeGeneral ? scopes.general : 0) +
    scopes.projects.filter((project) => selected.has(project.id)).reduce((sum, project) => sum + project.count, 0);
  const hiddenCompletedCount = scopes.projects
    .filter((project) => project.status === SourceProjectStatus.COMPLETE && !selected.has(project.id))
    .reduce((sum, project) => sum + project.count, 0);

  const rows = await prisma.standardTranslation.findMany({
    where: { AND: [matching, selectionWhere(selection)] },
    select: rowSelect,
    orderBy: [{ name: { sort: 'asc', nulls: 'last' } }, { sourceText: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE,
  });

  return { rows, total, selection, hiddenCompletedCount, scopes };
}

async function findGeneralClash(
  client: Client,
  entry: { languageId: string; sourceProjectId: string | null; sourceKey: string },
): Promise<StandardTranslationRow | null> {
  if (entry.sourceProjectId === null) return null;
  return client.standardTranslation.findFirst({
    where: { languageId: entry.languageId, sourceProjectId: null, sourceKey: entry.sourceKey },
    select: rowSelect,
  });
}

/**
 * The general entry a project entry would collide with when moved to all
 * projects, so the page can show both before asking which to keep. Null when
 * there is none, or when the entry is already general.
 */
export async function getMoveConflict(id: string): Promise<StandardTranslationRow | null> {
  const entry = await prisma.standardTranslation.findUnique({
    where: { id },
    select: { languageId: true, sourceProjectId: true, sourceKey: true },
  });
  return entry ? findGeneralClash(prisma, entry) : null;
}

// ─── Writes ──────────────────────────────────────────────────

/**
 * Entries translate out of the source language, so they belong to a target
 * language. The page lists only those; this keeps a direct call from writing
 * entries nothing reads.
 */
async function assertTargetLanguage(languageId: string) {
  const language = await prisma.language.findUnique({ where: { id: languageId }, select: { isSource: true } });
  if (!language) {
    throw new Error('Language not found');
  }
  if (language.isSource) {
    throw new Error('Standard translations belong to the languages documents are translated into');
  }
}

/**
 * An entry for one project belongs to a project the language translates.
 * Anything else would be an entry no document in the language can use.
 */
async function assertProjectInLanguage(sourceProjectId: string | null, languageId: string) {
  if (sourceProjectId === null) return;
  const translated = await prisma.translationProject.findUnique({
    where: { sourceProjectId_languageId: { sourceProjectId, languageId } },
    select: { id: true },
  });
  if (!translated) {
    throw new Error('That project is not translated into this language');
  }
}

/**
 * Two entries of one scope can't share a source (the unique index on
 * language, project and `sourceKey`, null project included). Prisma reports
 * the collision as a P2002 naming the index; this turns it into a sentence
 * that says where the existing entry is, as `rethrowUniqueViolation` does for
 * projects.
 */
async function rethrowDuplicate(error: unknown, languageId: string, sourceProjectId: string | null): Promise<never> {
  const { code, meta, message } = (error ?? {}) as { code?: string; meta?: { target?: unknown }; message?: string };
  const target = Array.isArray(meta?.target) ? meta.target.join(',') : String(meta?.target ?? '');
  const constraint = /constraint: `([^`]+)`/.exec(message ?? '')?.[1] ?? '';
  if (code !== 'P2002' || !(target.includes('sourceKey') || constraint.includes('sourceKey'))) throw error;

  const scope = sourceProjectId
    ? (await prisma.sourceProject.findUniqueOrThrow({ where: { id: sourceProjectId }, select: { name: true } })).name
    : `all projects in ${(await prisma.language.findUniqueOrThrow({ where: { id: languageId }, select: { name: true } })).name}`;
  throw new Error(`A standard translation with this source already exists for ${scope}`);
}

/** `sourceKey` is derived here and nowhere else, so it always follows `sourceText`. */
function entryData(input: UpdateStandardTranslationInput) {
  return {
    sourceProjectId: input.sourceProjectId,
    name: input.name,
    sourceText: input.sourceText,
    sourceKey: sourceKeyOf(input.sourceText),
    targetText: input.targetText,
    fixedForm: input.fixedForm,
    note: input.note,
  };
}

export async function createStandardTranslation(
  input: CreateStandardTranslationInput,
  userId: string,
): Promise<StandardTranslationRow> {
  await assertTargetLanguage(input.languageId);
  await assertProjectInLanguage(input.sourceProjectId, input.languageId);

  return prisma.standardTranslation
    .create({
      data: { languageId: input.languageId, ...entryData(input), createdById: userId, updatedById: userId },
      select: rowSelect,
    })
    .catch((error) => rethrowDuplicate(error, input.languageId, input.sourceProjectId));
}

/** The language is the stored entry's: an update never moves an entry to another language. */
export async function updateStandardTranslation(
  id: string,
  input: UpdateStandardTranslationInput,
  userId: string,
): Promise<StandardTranslationRow> {
  const stored = await prisma.standardTranslation.findUnique({ where: { id }, select: { languageId: true } });
  if (!stored) {
    throw new Error('Standard translation not found');
  }
  await assertProjectInLanguage(input.sourceProjectId, stored.languageId);

  return prisma.standardTranslation
    .update({ where: { id }, data: { ...entryData(input), updatedById: userId }, select: rowSelect })
    .catch((error) => rethrowDuplicate(error, stored.languageId, input.sourceProjectId));
}

export async function deleteStandardTranslation(id: string): Promise<void> {
  await prisma.standardTranslation.delete({ where: { id } });
}

/**
 * Makes a project entry general. When a general entry with the same source
 * already exists, one of the two has to go, and `keep` says which:
 * `'project'` replaces the general entry with this one, `'general'` drops this
 * one. Without `keep` a clash is refused, so nothing is lost unasked. Returns
 * the general entry that remains.
 */
export async function moveStandardTranslationToGeneral(
  id: string,
  keep: MoveKeep,
  userId: string,
): Promise<StandardTranslationRow> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.standardTranslation.findUnique({
      where: { id },
      select: { languageId: true, sourceProjectId: true, sourceKey: true },
    });
    if (!entry) {
      throw new Error('Standard translation not found');
    }
    if (entry.sourceProjectId === null) {
      throw new Error('This standard translation already applies to all projects');
    }

    const general = await findGeneralClash(tx, entry);
    if (general) {
      if (!keep) {
        throw new Error('A standard translation with this source already exists for all projects: choose which to keep');
      }
      if (keep === 'general') {
        await tx.standardTranslation.delete({ where: { id } });
        return general;
      }
      await tx.standardTranslation.delete({ where: { id: general.id } });
    }

    return tx.standardTranslation.update({
      where: { id },
      data: { sourceProjectId: null, updatedById: userId },
      select: rowSelect,
    });
  });
}
