'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { AdminListPage, DeleteConfirmDialog } from '@/components/admin-list-page';
import { ListPagination } from '@/components/list-pagination';
import { ListSearchInput } from '@/components/list-search-input';
import { ListSortSelect, type SortOption } from '@/components/list-sort-select';
import { DOCUMENT_TYPE_CONFIGS, DOCUMENT_TYPE_SEQUENCE } from '@/constants/document-type';
import {
  createSourceProjectAction,
  deleteSourceProjectAction,
  updateSourceProjectAction,
} from '@/domain/source-project/source-project.actions';
import type { SourceProjectListItem, SourceProjectSort } from '@/domain/source-project/source-project.repository';
import {
  ProjectFormFields,
  toCreateProjectInput,
  toUpdateProjectInput,
  useProjectForm,
} from '@/components/project-form';
import { buildListSearchParams, DEFAULT_PAGE_SIZE } from '@/lib/list-params';
import { capture } from '@/lib/analytics';
import type { SourceProject } from '@/generated/prisma/client';
import { DocumentType } from '@/generated/prisma/enums';
import { CheckCircle2, Edit, FolderOpen, Languages } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildProjectTranslationsPath } from '@/domain/source-project/source-project-url';

interface ProjectsClientProps {
  sourceProjects: SourceProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: SourceProjectSort;
  order: 'asc' | 'desc';
}

const DEFAULT_AUDIO_DOCUMENT_TYPES: DocumentType[] = [DocumentType.DAY, DocumentType.DAILY_CONTENT];

const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPE_SEQUENCE.map((value) => ({
  value,
  label: DOCUMENT_TYPE_CONFIGS[value].name,
}));

const SORT_OPTIONS: SortOption[] = [
  { sort: 'name', order: 'asc', label: 'Name A–Z' },
  { sort: 'name', order: 'desc', label: 'Name Z–A' },
  { sort: 'createdAt', order: 'desc', label: 'Newest first' },
  { sort: 'createdAt', order: 'asc', label: 'Oldest first' },
  { sort: 'status', order: 'asc', label: 'Active first' },
  { sort: 'status', order: 'desc', label: 'Complete first' },
];

export default function ProjectsClient({
  sourceProjects: initialSourceProjects,
  total,
  page,
  pageSize,
  searchQuery,
  sort,
  order,
}: ProjectsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sourceProjects, setSourceProjects] = useState(initialSourceProjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SourceProject | null>(null);
  const { values, set, reset } = useProjectForm();
  const [audioDocumentTypes, setAudioDocumentTypes] = useState<DocumentType[]>(DEFAULT_AUDIO_DOCUMENT_TYPES);
  const [loading, setLoading] = useState(false);

  const navigate = (updates: Record<string, string | number | null | undefined>) => {
    router.push(`${pathname}${buildListSearchParams(searchParams, updates)}`);
  };

  // Sync state with props when they change (e.g., after router.refresh())
  useEffect(() => {
    setSourceProjects(initialSourceProjects);
  }, [initialSourceProjects]);

  const resetForm = () => {
    setEditingProject(null);
    reset();
    setAudioDocumentTypes(DEFAULT_AUDIO_DOCUMENT_TYPES);
  };

  const toggleAudioDocumentType = (type: DocumentType) =>
    setAudioDocumentTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );

  // Replace one project in state, preserving its _count (server doesn't return _count on update)
  const replaceProjectPreservingCount = (updated: SourceProject) =>
    setSourceProjects(
      sourceProjects.map((p) =>
        p.id === updated.id
          ? {
              ...updated,
              _count: sourceProjects.find((sp) => sp.id === updated.id)?._count || {
                documents: 0,
                translationProjects: 0,
              },
            }
          : p,
      ),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingProject) {
        const updated = await updateSourceProjectAction(editingProject.id, {
          ...toUpdateProjectInput(values),
          audioDocumentTypes,
        });
        replaceProjectPreservingCount(updated);
        capture('source_project_updated');
      } else {
        // Create source project (this will also create translation projects for all languages)
        await createSourceProjectAction(toCreateProjectInput(values));
        capture('source_project_created', { location: 'admin' });
        // Refresh the page to get updated counts including translation projects
        router.refresh();
      }

      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving source project:', error);
      toast.error(error.message || 'Failed to save source project');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (project: SourceProject) => {
    setEditingProject(project);
    reset({
      name: project.name,
      description: project.description || '',
      identifier: project.identifier || '',
      acronym: project.acronym || '',
    });
    setAudioDocumentTypes(project.audioDocumentTypes ?? DEFAULT_AUDIO_DOCUMENT_TYPES);
    setDialogOpen(true);
  };

  const handleToggleStatus = async (project: SourceProject) => {
    const newStatus = project.status === 'ACTIVE' ? 'COMPLETE' : 'ACTIVE';

    try {
      const updated = await updateSourceProjectAction(project.id, { status: newStatus });
      replaceProjectPreservingCount(updated);
      capture('source_project_status_toggled', { status: newStatus });
      // Re-fetch so a status-sorted page re-orders and the total stays true.
      router.refresh();
    } catch (error: any) {
      console.error('Error updating project status:', error);
      toast.error(error.message || 'Failed to update project status');
    }
  };

  const handleDelete = async (id: string, documentCount: number) => {
    if (documentCount > 0) {
      toast.warning('Cannot delete source project with documents. Please move or delete documents first.');
      return;
    }

    try {
      await deleteSourceProjectAction(id);
      setSourceProjects(sourceProjects.filter((p) => p.id !== id));
      capture('source_project_deleted');
      toast.success('Source project deleted successfully');
      router.refresh();
    } catch (error: any) {
      console.error('Error deleting source project:', error);
      toast.error(error.message || 'Failed to delete source project');
    }
  };

  return (
    <AdminListPage
      title="Source Projects"
      description="Manage source projects and their translations"
      addLabel="Add Source Project"
      dialogOpen={dialogOpen}
      onDialogOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}
      dialogTitle={editingProject ? 'Edit Source Project' : 'Add Source Project'}
      onSubmit={handleSubmit}
      loading={loading}
      formFields={
        <>
          <ProjectFormFields values={values} onChange={set} idPrefix="admin-project" />
          {editingProject && (
            <div>
              <Label>Generate audio for</Label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {DOCUMENT_TYPE_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={audioDocumentTypes.includes(value)}
                      onChange={() => toggleAudioDocumentType(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Approved documents of these types get generated audio</p>
            </div>
          )}
        </>
      }
    >
      <div className="flex flex-wrap gap-4 items-center">
        <ListSearchInput
          value={searchQuery}
          onSearch={(query) => navigate({ q: query || null })}
          placeholder="Search projects..."
        />
        <ListSortSelect
          sort={sort}
          order={order}
          options={SORT_OPTIONS}
          onChange={(nextSort, nextOrder) => navigate({ sort: nextSort, order: nextOrder })}
        />
      </div>

      {sourceProjects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>{searchQuery ? 'No projects found' : 'No projects yet'}</EmptyTitle>
            <EmptyDescription>
              {searchQuery
                ? 'No projects match your search. Try adjusting it.'
                : 'Get started by adding your first source project.'}
            </EmptyDescription>
          </EmptyHeader>
          {searchQuery && (
            <EmptyContent>
              <Button variant="outline" onClick={() => router.push(pathname)}>
                Clear search
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        sourceProjects.map((project) => (
          <Card key={project.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <FolderOpen className="h-5 w-5 text-blue-500" />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{project.name}</h3>
                    {project.status === 'COMPLETE' && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Complete
                      </Badge>
                    )}
                    <Link
                      href={buildProjectTranslationsPath(project.identifier)}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Languages className="h-4 w-4" />
                      Manage Translations
                    </Link>
                  </div>
                  {project.description && <p className="text-sm text-gray-600 mt-1">{project.description}</p>}
                  {(project as any).identifier && (
                    <p className="text-xs text-gray-500 mt-1">ID: {(project as any).identifier}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>{project._count.documents} document(s)</span>
                    <span>{project._count.translationProjects} translation project(s)</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleStatus(project)}
                  title={project.status === 'ACTIVE' ? 'Mark as Complete' : 'Mark as Active'}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleEdit(project)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <DeleteConfirmDialog
                  title="Delete Source Project"
                  description={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`}
                  onConfirm={() => handleDelete(project.id, project._count.documents)}
                />
              </div>
            </div>
          </Card>
        ))
      )}

      {total > 0 && (
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
      )}
    </AdminListPage>
  );
}
