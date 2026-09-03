import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { listSourceProjectsPaginatedAction } from '@/domain/source-project/source-project.actions';
import { SOURCE_PROJECT_SORTS, type SourceProjectSort } from '@/domain/source-project/source-project.repository';
import { buildListSearchParams, getTotalPages, parseListParams, toURLSearchParams } from '@/lib/list-params';
import ProjectsClient from './page.client';

export default async function ProjectsPage({
  searchParams,
}: {
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

  // Server-side pagination, search, and sorting (issue #51). The admin list
  // always includes complete projects; the URL carries ?page= ?q= ?sort=
  // ?order= ?pageSize= so state stays shareable and bookmarkable.
  const params = await searchParams;
  const list = parseListParams(params, {
    allowedSorts: SOURCE_PROJECT_SORTS,
    defaultSort: 'name',
    defaultOrder: 'asc',
  });

  const { sourceProjects, total } = await listSourceProjectsPaginatedAction({
    search: list.q || undefined,
    includeComplete: true,
    sort: list.sort as SourceProjectSort,
    order: list.order,
    skip: list.skip,
    take: list.take,
  });

  // A bookmarked page past the end would render an empty list next to a
  // contradictory range line — redirect to the last valid page instead.
  const totalPages = getTotalPages(total, list.pageSize);
  if (list.page > totalPages && total > 0) {
    redirect(
      `/admin/projects${buildListSearchParams(toURLSearchParams(params), { page: totalPages === 1 ? null : totalPages })}`,
    );
  }

  return (
    <ProjectsClient
      sourceProjects={sourceProjects}
      total={total}
      page={list.page}
      pageSize={list.pageSize}
      searchQuery={list.q}
      sort={list.sort as SourceProjectSort}
      order={list.order}
    />
  );
}
