'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListPagination } from '@/components/list-pagination';
import { ListSearchInput } from '@/components/list-search-input';
import { ListSortSelect, type SortOption } from '@/components/list-sort-select';
import { buildDocumentEditPath, buildDocumentPath } from '@/domain/document/document-url';
import { DocumentTypeBadge } from '@/components/document-type-badge';
import { DOCUMENT_STATUS_SEQUENCE, NO_STATUS, getDocumentStatusConfig } from '@/constants/document-status';
import { DOCUMENT_TYPE_CONFIGS, DOCUMENT_TYPE_SEQUENCE } from '@/constants/document-type';
import { buildListSearchParams, DEFAULT_PAGE_SIZE } from '@/lib/list-params';
import { capture } from '@/lib/analytics';
import { isAdminClient } from '@/lib/permissions-client';
import { SessionUser } from '@/lib/session';
import type { Language } from '@/generated/prisma/client';
import { DocumentStatus, DocumentType } from '@/generated/prisma/enums';
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DocumentOverviewSort } from '@/domain/document/document.repository';

// Mirrors `documentOverviewSelect` in document.repository.ts. Keep the two in
// step: anything added here has to be selected there, and anything the table
// stops using should be dropped from both.
type DocumentWithVersions = {
  id: string;
  slug: string;
  title: string;
  labels: string[];
  type: DocumentType | null;
  originalFilename: string | null;
  sourceProjectId: string | null;
  sourceProject: { id: string; name: string; identifier: string } | null;
  versions: Array<{
    id: string;
    languageId: string;
    status: DocumentStatus;
  }>;
};

interface DocumentsClientProps {
  user: SessionUser;
  documents: DocumentWithVersions[];
  total: number;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: DocumentOverviewSort;
  order: 'asc' | 'desc';
  languages: Language[];
  sourceProjects: any[];
  initialFilters: {
    sourceProject?: string;
    type?: DocumentType;
  };
  handleDeleteDocument: (id: string) => Promise<void>;
}

const SORT_OPTIONS: SortOption[] = [
  { sort: 'title', order: 'asc', label: 'Title A–Z' },
  { sort: 'title', order: 'desc', label: 'Title Z–A' },
  { sort: 'filename', order: 'asc', label: 'Filename A–Z' },
  { sort: 'filename', order: 'desc', label: 'Filename Z–A' },
  { sort: 'type', order: 'asc', label: 'Type ↑' },
  { sort: 'type', order: 'desc', label: 'Type ↓' },
  { sort: 'createdAt', order: 'desc', label: 'Newest first' },
  { sort: 'createdAt', order: 'asc', label: 'Oldest first' },
  { sort: 'updatedAt', order: 'desc', label: 'Recently updated' },
  { sort: 'updatedAt', order: 'asc', label: 'Least recently updated' },
  { sort: 'status', order: 'asc', label: 'Least progress first' },
  { sort: 'status', order: 'desc', label: 'Most progress first' },
];

interface SortableHeadProps {
  label: string;
  sortKey: DocumentOverviewSort;
  activeSort: DocumentOverviewSort;
  activeOrder: 'asc' | 'desc';
  href: string;
  onSort: (sort: DocumentOverviewSort, order: 'asc' | 'desc') => void;
  className?: string;
}

/** Clicking a column header toggles its sort, sharing URL state with the sort dropdown. */
function SortableHead({ label, sortKey, activeSort, activeOrder, href, onSort, className }: SortableHeadProps) {
  const isActive = activeSort === sortKey;
  const nextOrder = isActive && activeOrder === 'asc' ? 'desc' : 'asc';
  const SortIcon = !isActive ? ArrowUpDown : activeOrder === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (activeOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Link
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onSort(sortKey, nextOrder);
        }}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`Sort by ${label.toLowerCase()}, ${nextOrder === 'asc' ? 'ascending' : 'descending'}`}
      >
        {label}
        <SortIcon className="size-4" />
      </Link>
    </TableHead>
  );
}

export default function DocumentsClient({
  user,
  documents,
  total,
  page,
  pageSize,
  searchQuery,
  sort,
  order,
  languages,
  sourceProjects,
  initialFilters,
  handleDeleteDocument,
}: DocumentsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedSourceProject = initialFilters.sourceProject || 'all';
  const selectedType = initialFilters.type || 'all';
  const isAdmin = isAdminClient(user);

  const navigate = (updates: Record<string, string | number | null | undefined>) => {
    router.push(`${pathname}${buildListSearchParams(searchParams, updates)}`);
  };

  // The title opens the language this document is actually being worked in,
  // falling back to the first target language. With no target languages at all
  // there is no editor URL to build, so it links to the overview row's edit form.
  const titleHref = (doc: DocumentWithVersions) => {
    const existing = doc.versions.find((v) => languages.some((l) => l.id === v.languageId));
    const code = languages.find((l) => l.id === existing?.languageId)?.code ?? languages[0]?.code;
    if (!code) {
      return buildDocumentEditPath({
        projectIdentifier: doc.sourceProject?.identifier,
        slug: doc.slug,
        documentId: doc.id,
      });
    }
    return buildDocumentPath({
      projectIdentifier: doc.sourceProject?.identifier,
      slug: doc.slug,
      languageCode: code,
      documentId: doc.id,
    });
  };

  const getLanguageStatus = (doc: DocumentWithVersions, languageId: string) => {
    const version = doc.versions.find((v) => v.languageId === languageId);
    return version?.status || null;
  };

  const getVersionId = (doc: DocumentWithVersions, languageId: string) => {
    const version = doc.versions.find((v) => v.languageId === languageId);
    return version?.id;
  };

  const isFiltered = searchQuery !== '' || selectedSourceProject !== 'all' || selectedType !== 'all';

  const sortHrefFor = (key: DocumentOverviewSort) => {
    const nextOrder = sort === key && order === 'asc' ? 'desc' : 'asc';
    return `${pathname}${buildListSearchParams(searchParams, { sort: key, order: nextOrder })}`;
  };
  const handleSort = (nextSort: DocumentOverviewSort, nextOrder: 'asc' | 'desc') =>
    navigate({ sort: nextSort, order: nextOrder });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Documents Overview"
        description="View translation status across all languages"
        actions={
          <Button asChild>
            <Link href="/documents/new">
              <Plus />
              New Document
            </Link>
          </Button>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <ListSearchInput
            value={searchQuery}
            onSearch={(query) => navigate({ q: query || null })}
            placeholder="Search documents..."
          />
          <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            {/* Plain span, not a <label>: this captions the filter group but is
                not attached to a control. Metrics mirror the Label siblings
                (pb-1, leading-none) so the baselines line up. */}
            <span className="pb-1 text-sm leading-none font-medium text-muted-foreground">Filter by</span>
            <Field orientation="horizontal" className="w-auto">
              <FieldLabel htmlFor="documents-project-filter">Project</FieldLabel>
              <Select
                value={selectedSourceProject}
                onValueChange={(value) => navigate({ sourceProject: value === 'all' ? null : value, page: null })}
              >
                <SelectTrigger id="documents-project-filter" className="w-full sm:w-48">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All projects</SelectItem>
                    {sourceProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} ({project._count.documents})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal" className="w-auto">
              <FieldLabel htmlFor="documents-type-filter">Type</FieldLabel>
              <Select
                value={selectedType}
                onValueChange={(value) => navigate({ type: value === 'all' ? null : value, page: null })}
              >
                <SelectTrigger id="documents-type-filter" className="w-full sm:w-40">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All types</SelectItem>
                    {DOCUMENT_TYPE_SEQUENCE.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DOCUMENT_TYPE_CONFIGS[type].name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <ListSortSelect
              sort={sort}
              order={order}
              options={SORT_OPTIONS}
              onChange={(nextSort, nextOrder) => navigate({ sort: nextSort, order: nextOrder })}
            />
          </div>
        </div>
      </PageHeader>

      <div className="container mx-auto px-4 py-4">
        {documents.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No documents found' : 'No documents yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'No documents match your search or filters. Try adjusting them.'
                  : 'Get started by creating your first document.'}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {isFiltered ? (
                <Button variant="outline" onClick={() => router.push(pathname)}>
                  Clear search and filters
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/documents/new">New Document</Link>
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <SortableHead
                    label="Title"
                    sortKey="title"
                    activeSort={sort}
                    activeOrder={order}
                    href={sortHrefFor('title')}
                    onSort={handleSort}
                    className="min-w-[200px]"
                  />
                  <SortableHead
                    label="Filename"
                    sortKey="filename"
                    activeSort={sort}
                    activeOrder={order}
                    href={sortHrefFor('filename')}
                    onSort={handleSort}
                    className="min-w-[120px]"
                  />
                  <SortableHead
                    label="Type"
                    sortKey="type"
                    activeSort={sort}
                    activeOrder={order}
                    href={sortHrefFor('type')}
                    onSort={handleSort}
                    className="min-w-[80px]"
                  />
                  {languages.map((lang) => (
                    <TableHead key={lang.id} className="text-center min-w-[60px]">
                      {lang.name}
                    </TableHead>
                  ))}
                  {isAdmin && <TableHead className="text-right min-w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/*
                  Flat list, never grouped by project. Grouping could only ever
                  see the rows the server sliced out for this page, so headers
                  would repeat across pages, their counts would report the page
                  rather than the project, and the bucketing would pull rows out
                  of the true global sort. The project filter (whose dropdown
                  carries real per-project counts) is the way to view one project.
                */}
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link
                          href={titleHref(doc)}
                          prefetch={false}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {doc.title}
                        </Link>
                        {doc.labels && doc.labels.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {doc.labels.map((label: string) => (
                              <Badge key={label} variant="secondary" className="text-xs py-0">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600 text-sm">{doc.originalFilename || '—'}</TableCell>
                    <TableCell>
                      {doc.type ? (
                        <DocumentTypeBadge type={doc.type} />
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>
                    {languages.map((lang) => {
                      const status = getLanguageStatus(doc, lang.id);
                      const versionId = getVersionId(doc, lang.id);
                      const statusConfig = getDocumentStatusConfig(status);
                      const IndicatorIcon = statusConfig.icon;

                      // One URL per language; the status decides which editor opens.
                      const href = buildDocumentPath({
                        projectIdentifier: doc.sourceProject?.identifier,
                        slug: doc.slug,
                        languageCode: lang.code,
                        documentId: doc.id,
                      });

                      return (
                        <TableCell key={lang.id} className="text-center">
                          <Link href={href} prefetch={false} className="group inline-flex justify-center">
                            <div
                              className={`${statusConfig.color.textClass} transition-transform group-hover:scale-125 cursor-pointer`}
                              title={versionId ? statusConfig.name : 'Start translation'}
                            >
                              <IndicatorIcon className="h-4 w-4" />
                            </div>
                          </Link>
                        </TableCell>
                      );
                    })}
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            href={buildDocumentEditPath({
                              projectIdentifier: doc.sourceProject?.identifier,
                              slug: doc.slug,
                              documentId: doc.id,
                            })}
                            prefetch={false}
                          >
                            <Button variant="ghost" size="sm">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete &ldquo;{doc.title}&rdquo;? This will delete the source
                                  version and all translation versions. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    await handleDeleteDocument(doc.id);
                                    capture('document_deleted', { location: 'list', document_id: doc.id });
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <div className="mt-4">
            <ListPagination
              page={page}
              total={total}
              pageSize={pageSize}
              onPageChange={(nextPage) => navigate({ page: nextPage === 1 ? null : nextPage })}
              onPageSizeChange={(nextSize) => navigate({ perPage: nextSize === DEFAULT_PAGE_SIZE ? null : nextSize })}
              getPageHref={(target) =>
                `${pathname}${buildListSearchParams(searchParams, { page: target === 1 ? null : target })}`
              }
            />
          </div>
        )}

        {/* Legend */}
        {documents.length > 0 && (
          <Card className="mt-4 p-4 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Legend</h4>
            <div className="flex flex-wrap gap-6 text-sm">
              {[...DOCUMENT_STATUS_SEQUENCE, null].map((status) => {
                const config = status ? getDocumentStatusConfig(status) : NO_STATUS;
                const Icon = config.icon;

                return (
                  <div key={config.status} className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.color.textClass}`} />
                    <span className="text-gray-600">{config.name}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
