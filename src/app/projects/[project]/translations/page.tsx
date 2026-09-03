import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listTranslationProjectsPaginatedAction } from '@/domain/translation-project/translation-project.actions';
import {
  TRANSLATION_PROJECT_SORTS,
  type TranslationProjectSort,
} from '@/domain/translation-project/translation-project.repository';
import { listTargetLanguages } from '@/domain/language/language.repository';
import { buildListSearchParams, getTotalPages, parseListParams, toURLSearchParams } from '@/lib/list-params';
import TranslationsClient from './page.client';
import { resolveProject } from '../resolve-project';

export default async function TranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    q?: string;
    search?: string;
    page?: string;
    pageSize?: string;
    perPage?: string;
    sort?: string;
    order?: string;
  }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { project } = await params;
  const query = await searchParams;
  const sourceProject = await resolveProject(project, '/translations');

  // Server-side pagination, search, and sorting (issue #51). The URL carries
  // ?page= ?q= ?sort= ?order= ?pageSize= so state stays shareable.
  const list = parseListParams(query, {
    allowedSorts: TRANSLATION_PROJECT_SORTS,
    defaultSort: 'name',
    defaultOrder: 'asc',
  });

  const [{ translationProjects, total }, languages] = await Promise.all([
    listTranslationProjectsPaginatedAction({
      sourceProjectId: sourceProject.id,
      search: list.q || undefined,
      sort: list.sort as TranslationProjectSort,
      order: list.order,
      skip: list.skip,
      take: list.take,
    }),
    listTargetLanguages(),
  ]);

  // A bookmarked page past the end would render an empty list next to a
  // contradictory range line — redirect to the last valid page instead.
  const totalPages = getTotalPages(total, list.pageSize);
  if (list.page > totalPages && total > 0) {
    const base = `/projects/${project}/translations`;
    redirect(`${base}${buildListSearchParams(toURLSearchParams(query), { page: totalPages === 1 ? null : totalPages })}`);
  }

  return (
    <TranslationsClient
      sourceProject={sourceProject}
      translationProjects={translationProjects}
      total={total}
      page={list.page}
      pageSize={list.pageSize}
      searchQuery={list.q}
      sort={list.sort as TranslationProjectSort}
      order={list.order}
      languages={languages}
    />
  );
}
