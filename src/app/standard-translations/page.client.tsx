'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookMarked, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { ListPagination } from '@/components/list-pagination';
import { ListSearchInput } from '@/components/list-search-input';
import { PageHeader } from '@/components/page-header';
import { StandardTranslationDialog } from '@/components/standard-translation-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteStandardTranslationAction } from '@/domain/standard-translation/standard-translation.actions';
import type {
  StandardTranslationRow,
  StandardTranslationsPage,
} from '@/domain/standard-translation/standard-translation.repository';
import type { ScopeSelection } from '@/domain/standard-translation/standard-translation.types';
import { formatExactDateTime, formatLastActive } from '@/lib/format';
import { buildListSearchParams, DEFAULT_PAGE_SIZE } from '@/lib/list-params';
import { entryLabel } from './entry-label';
import { scopeParam, withCompletedProjects } from './scope';
import { ScopeFilter } from './scope-filter';

interface StandardTranslationsLanguage {
  id: string;
  code: string;
  name: string;
}

const TITLE = 'Standard translations';
const DESCRIPTION =
  'Prayers, forms and phrases your team always translates the same way. AI translation uses them instead of translating again. Scripture always comes from the Bible.';

export default function StandardTranslationsClient({
  languages,
  selectedCode,
  list,
  q,
  page,
}: {
  languages: StandardTranslationsLanguage[];
  selectedCode: string | null;
  /** The selected language's entries; null when the viewer has no language. */
  list: StandardTranslationsPage | null;
  q: string;
  page: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const language = languages.find((candidate) => candidate.code === selectedCode) ?? null;

  // A null entry is a new one.
  const editing = useDialogTarget<StandardTranslationRow | null>();
  const deleting = useDialogTarget<StandardTranslationRow>();

  if (!language || !list) {
    return (
      <>
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookMarked />
            </EmptyMedia>
            <EmptyTitle>No language yet</EmptyTitle>
            <EmptyDescription>
              You are not assigned to any language yet. Ask an administrator to add you to one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  const projects = list.scopes.projects;
  // The scope counts follow the search, so without one they say whether the
  // language has any entries at all, selected or not.
  const languageHasEntries = list.scopes.general + projects.reduce((sum, project) => sum + project.count, 0) > 0;
  const navigate = (updates: Record<string, string | number | null>) => {
    router.push(`${pathname}${buildListSearchParams(searchParams, updates)}`);
  };
  // A new selection lists from its first page.
  const changeScope = (selection: ScopeSelection) => navigate({ scope: scopeParam(selection, projects), page: null });

  const handleSaved = () => {
    toast.success(editing.target ? 'Standard translation saved' : 'Standard translation added');
    editing.hide();
    router.refresh();
  };

  const handleDelete = async (entry: StandardTranslationRow) => {
    try {
      await deleteStandardTranslationAction(entry.id);
      toast.success(`“${entryLabel(entry)}” deleted`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The standard translation could not be deleted');
    }
  };

  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <Button onClick={() => editing.show(null)}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        }
      >
        <Tabs
          value={language.code}
          onValueChange={(code) => router.push(`${pathname}?lang=${encodeURIComponent(code)}`)}
        >
          <TabsList aria-label="Language" className="max-w-full overflow-x-auto">
            {languages.map((candidate) => (
              <TabsTrigger key={candidate.code} value={candidate.code}>
                {candidate.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <ListSearchInput
            value={q}
            onSearch={(query) => navigate({ q: query || null })}
            placeholder="Search name, source or translation…"
          />
          <ScopeFilter selection={list.selection} scopes={list.scopes} onChange={changeScope} />
          <span className="text-muted-foreground ml-auto text-sm">
            {list.total} {list.total === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {list.rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookMarked />
              </EmptyMedia>
              <EmptyTitle>
                {q
                  ? 'No standard translations found'
                  : languageHasEntries
                    ? 'No standard translations in this scope'
                    : 'No standard translations yet'}
              </EmptyTitle>
              <EmptyDescription>
                {q
                  ? 'Nothing matches your search in this scope.'
                  : languageHasEntries
                    ? 'Choose more projects under Scope to see the rest.'
                    : `Add the prayers and phrases the ${language.name} team always translates the same way.`}
              </EmptyDescription>
            </EmptyHeader>
            {q && (
              <EmptyContent>
                <Button variant="outline" onClick={() => navigate({ q: null })}>
                  Clear search
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Name</TableHead>
                  <TableHead>Source · English</TableHead>
                  <TableHead>Standard translation · {language.name}</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="align-top font-medium whitespace-normal">
                      {entry.name ?? <span className="text-muted-foreground font-normal">—</span>}
                    </TableCell>
                    <TableCell className="max-w-80 align-top whitespace-normal">
                      <p className="line-clamp-2">{entry.sourceText}</p>
                    </TableCell>
                    <TableCell className="max-w-80 align-top whitespace-normal">
                      <p className="line-clamp-2">
                        {entry.targetText}
                        {entry.fixedForm && (
                          <Badge variant="secondary" className="ml-1.5">
                            Fixed form
                          </Badge>
                        )}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      {entry.sourceProject ? (
                        <Badge variant="outline">{entry.sourceProject.name}</Badge>
                      ) : (
                        <Badge variant="secondary">All projects</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top">
                      <UpdatedBy entry={entry} />
                    </TableCell>
                    <TableCell className="align-top">
                      <RowMenu
                        entry={entry}
                        onEdit={() => editing.show(entry)}
                        onDelete={() => deleting.show(entry)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {list.hiddenCompletedCount > 0 && (
          <p className="text-sm">
            {list.hiddenCompletedCount} {list.hiddenCompletedCount === 1 ? 'entry' : 'entries'} from completed projects{' '}
            {list.hiddenCompletedCount === 1 ? 'is' : 'are'} hidden.{' '}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => changeScope(withCompletedProjects(list.selection, projects))}
            >
              Show them
            </Button>
          </p>
        )}

        {list.total > 0 && (
          <ListPagination
            page={page}
            total={list.total}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={(next) => navigate({ page: next === 1 ? null : next })}
            getPageHref={(target) =>
              `${pathname}${buildListSearchParams(searchParams, { page: target === 1 ? null : target })}`
            }
          />
        )}
      </div>

      <StandardTranslationDialog
        open={editing.open}
        onOpenChange={(open) => !open && editing.hide()}
        language={language}
        projects={projects}
        entry={editing.target}
        onSaved={handleSaved}
      />

      <AlertDialog open={deleting.open} onOpenChange={(open) => !open && deleting.hide()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this standard translation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting.target && entryLabel(deleting.target)}” is removed from the {language.name} standard translations. AI
              translation will translate this text again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting.target && handleDelete(deleting.target)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * What a dialog is open for. Closing keeps the target, so the dialog doesn't
 * go blank while it fades out.
 */
function useDialogTarget<T>() {
  const [state, setState] = useState<{ open: boolean; target: T | null }>({ open: false, target: null });
  return {
    ...state,
    show: (target: T) => setState({ open: true, target }),
    hide: () => setState((current) => ({ ...current, open: false })),
  };
}

/** Who changed the entry last and when; who added it shows on hover and focus. */
function UpdatedBy({ entry }: { entry: StandardTranslationRow }) {
  const updatedBy = entry.updatedBy?.name ?? 'Unknown';
  const createdBy = entry.createdBy?.name ?? 'Unknown';
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="whitespace-nowrap" />}>
        {updatedBy} · <span suppressHydrationWarning>{formatLastActive(entry.updatedAt)}</span>
      </TooltipTrigger>
      <TooltipContent>
        Added by {createdBy} on {formatExactDateTime(entry.createdAt)}. Last changed by {updatedBy} on{' '}
        {formatExactDateTime(entry.updatedAt)}.
      </TooltipContent>
    </Tooltip>
  );
}

function RowMenu({
  entry,
  onEdit,
  onDelete,
}: {
  entry: StandardTranslationRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={`Actions for ${entryLabel(entry)}`} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
