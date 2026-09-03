'use client';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListPagination } from '@/components/list-pagination';
import { ListSearchInput } from '@/components/list-search-input';
import { ListSortSelect, type SortOption } from '@/components/list-sort-select';
import { createTranslationProjectAction } from '@/domain/translation-project/translation-project.actions';
import type { TranslationProjectSort } from '@/domain/translation-project/translation-project.repository';
import { buildListSearchParams, DEFAULT_PAGE_SIZE } from '@/lib/list-params';
import { capture } from '@/lib/analytics';
import { Language, Prisma } from '@prisma/client';
import { ExternalLink, Languages, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildTranslationProjectPath } from '@/domain/source-project/source-project-url';

type TranslationProjectListItem = Prisma.TranslationProjectGetPayload<{
  include: {
    sourceProject: true;
    language: {
      include: {
        users: {
          select: {
            userId: true;
          };
        };
      };
    };
  };
}> & {
  /** Derived from the versions in this project's language. */
  documentCount: number;
};

type SourceProjectWithDetails = Prisma.SourceProjectGetPayload<{
  include: {
    documents: true;
    translationProjects: {
      include: {
        language: {
          include: {
            _count: {
              select: {
                users: true;
              };
            };
          };
        };
      };
    };
  };
}>;

interface TranslationsClientProps {
  sourceProject: SourceProjectWithDetails;
  translationProjects: TranslationProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  searchQuery: string;
  sort: TranslationProjectSort;
  order: 'asc' | 'desc';
  languages: Language[];
}

const SORT_OPTIONS: SortOption[] = [
  { sort: 'name', order: 'asc', label: 'Name A–Z' },
  { sort: 'name', order: 'desc', label: 'Name Z–A' },
  { sort: 'createdAt', order: 'desc', label: 'Newest first' },
  { sort: 'createdAt', order: 'asc', label: 'Oldest first' },
];

export default function TranslationsClient({
  sourceProject,
  translationProjects: initialTranslationProjects,
  total,
  page,
  pageSize,
  searchQuery,
  sort,
  order,
  languages,
}: TranslationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [translationProjects, setTranslationProjects] = useState(initialTranslationProjects);

  const navigate = (updates: Record<string, string | number | null | undefined>) => {
    router.push(`${pathname}${buildListSearchParams(searchParams, updates)}`);
  };

  // Sync state with props when they change (e.g., after router.refresh())
  useEffect(() => {
    setTranslationProjects(initialTranslationProjects);
  }, [initialTranslationProjects]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createTranslationProjectAction({
        name,
        sourceProjectId: sourceProject.id,
        languageId: selectedLanguageId,
      });
      capture('translation_project_created');
      setDialogOpen(false);
      resetForm();
      router.refresh();
    } catch (error: any) {
      console.error('Error creating translation project:', error);
      toast.error(error.message || 'Failed to create translation project');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSelectedLanguageId('');
  };

  // Get languages that don't have a translation project yet
  const availableLanguages = languages.filter((lang) => !translationProjects.some((tp) => tp.languageId === lang.id));

  // Check if we have any languages at all
  const hasNoLanguages = languages.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        back={{ href: '/admin/projects', label: 'Back to Projects' }}
        title={sourceProject.name}
        description="Translation Projects"
        actions={
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={availableLanguages.length === 0}>
                <Plus />
                Create Translation Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Translation Project</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`${sourceProject.name} - [Language]`}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="language">Target Language *</Label>
                  <Select value={selectedLanguageId} onValueChange={setSelectedLanguageId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {availableLanguages.map((lang) => (
                          <SelectItem key={lang.id} value={lang.id}>
                            {lang.name} ({lang.code})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {availableLanguages.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">All languages already have translation projects</p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || !selectedLanguageId}>
                    {loading ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      >
        {hasNoLanguages && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>No target languages available.</span>
            <Link href="/admin/languages" className="flex items-center gap-1 text-blue-600 hover:underline">
              Add languages
              <ExternalLink className="size-3" />
            </Link>
          </div>
        )}
        {!hasNoLanguages && availableLanguages.length === 0 && (
          <div className="text-sm text-muted-foreground">All languages already have translation projects.</div>
        )}
      </PageHeader>

      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <ListSearchInput
            value={searchQuery}
            onSearch={(query) => navigate({ q: query || null })}
            placeholder="Search translation projects..."
          />
          <div className="ml-auto">
            <ListSortSelect
              sort={sort}
              order={order}
              options={SORT_OPTIONS}
              onChange={(nextSort, nextOrder) => navigate({ sort: nextSort, order: nextOrder })}
            />
          </div>
        </div>
        <div className="grid gap-4">
          {translationProjects.map((tp) => (
            <Card key={tp.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Languages className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{tp.name}</h3>
                      <Link
                        href={buildTranslationProjectPath(sourceProject.identifier, tp.id)}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Users className="h-4 w-4" />
                        Manage
                      </Link>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {tp.language.name} ({tp.language.code})
                    </p>
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>{tp.language.users.length} member(s)</span>
                      <span>{tp.documentCount} document(s)</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {translationProjects.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Languages />
                </EmptyMedia>
                <EmptyTitle>{searchQuery ? 'No translation projects found' : 'No translation projects yet'}</EmptyTitle>
                <EmptyDescription>
                  {searchQuery
                    ? 'No translation projects match your search. Try adjusting it.'
                    : 'Create one to get started.'}
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
          )}
        </div>

        {total > 0 && (
          <div className="mt-4">
            <ListPagination
              page={page}
              total={total}
              pageSize={pageSize}
              onPageChange={(nextPage) => navigate({ page: nextPage === 1 ? null : nextPage })}
              onPageSizeChange={(nextSize) => navigate({ pageSize: nextSize === DEFAULT_PAGE_SIZE ? null : nextSize })}
              getPageHref={(target) =>
                `${pathname}${buildListSearchParams(searchParams, { page: target === 1 ? null : target })}`
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
