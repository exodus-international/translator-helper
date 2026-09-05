import { deleteDocumentActionVoid, listDocumentsOverviewAction } from '@/domain/document/document.actions';
import {
  DOCUMENT_OVERVIEW_SORTS,
  type DocumentOverviewSort,
} from '@/domain/document/document.repository';
import { listTargetLanguages } from '@/domain/language/language.repository';
import { listSourceProjectsAction } from '@/domain/source-project/source-project.actions';
import { buildListSearchParams, DEFAULT_ORDER, getTotalPages, parseListParams, toURLSearchParams } from '@/lib/list-params';
import { getCurrentUser } from '@/lib/session';
import { DocumentType } from '@/generated/prisma/enums';
import { redirect } from 'next/navigation';
import DocumentsClient from './page.client';

const DOCUMENT_TYPES = Object.values(DocumentType);

function parseDocType(raw: string | string[] | undefined): DocumentType | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && DOCUMENT_TYPES.includes(value as DocumentType) ? (value as DocumentType) : undefined;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    sourceProject?: string;
    type?: string | string[];
    search?: string;
    q?: string;
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

  const params = await searchParams;

  // Server-side pagination, search, and sorting (issue #51): the URL is the
  // source of truth (?page= ?q= ?sort= ?order= ?perPage=) so state stays
  // shareable and bookmarkable. Legacy ?search= / ?pageSize= still parse.
  const list = parseListParams(params, {
    allowedSorts: DOCUMENT_OVERVIEW_SORTS,
    defaultSort: 'updatedAt',
    defaultOrder: DEFAULT_ORDER,
  });
  // Unknown ?sourceProject= / ?type= values fall back instead of 500ing or
  // filtering down to a permanently empty list.
  const docType = parseDocType(params.type);

  const [languages, sourceProjects] = await Promise.all([listTargetLanguages(), listSourceProjectsAction()]);
  const projectIds = new Set(sourceProjects.map((p) => p.id));
  const sourceProjectId = params.sourceProject && projectIds.has(params.sourceProject) ? params.sourceProject : undefined;

  const { documents, total } = await listDocumentsOverviewAction({
    search: list.q || undefined,
    sourceProjectId,
    types: docType ? [docType] : undefined,
    sort: list.sort as DocumentOverviewSort,
    order: list.order,
    skip: list.skip,
    take: list.take,
  });

  // A bookmarked page past the end would otherwise render a false "no
  // documents" state next to a "Showing 126–142 of 142" line — redirect to
  // the last valid page so the address bar stays honest.
  const totalPages = getTotalPages(total, list.pageSize);
  if (list.page > totalPages && total > 0) {
    redirect(
      `/documents${buildListSearchParams(toURLSearchParams(params), { page: totalPages === 1 ? null : totalPages })}`,
    );
  }

  return (
    <DocumentsClient
      user={user}
      documents={documents}
      total={total}
      page={list.page}
      pageSize={list.pageSize}
      searchQuery={list.q}
      sort={list.sort as DocumentOverviewSort}
      order={list.order}
      languages={languages}
      sourceProjects={sourceProjects}
      handleDeleteDocument={deleteDocumentActionVoid}
      initialFilters={{
        sourceProject: sourceProjectId,
        type: docType,
      }}
    />
  );
}
