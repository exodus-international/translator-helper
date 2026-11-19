'use client';

import { PageHeader } from '@/components/page-header';
import { formatCount } from '@/components/bible/admin/bible-admin';
import { CoverageMeter } from '@/components/bible/admin/coverage-meter';
import { ImportBibleDialog } from '@/components/bible/admin/import-dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteBibleTranslationAction, setBibleLanguageDefaultAction } from '@/domain/bible/bible.actions';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import { formatExactDateTime, formatUnambiguousDate } from '@/lib/format';
import { BookOpen, BookOpenCheck, FileUp, MoreHorizontal, Star, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function BibleAdminClient({ translations }: { translations: BibleTranslationDto[] }) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'translation' | 'versification'>('translation');
  const [importCode, setImportCode] = useState<string | undefined>();
  const [importKey, setImportKey] = useState(0);
  const [deleting, setDeleting] = useState<BibleTranslationDto | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const openImport = (mode: 'translation' | 'versification' = 'translation', code?: string) => {
    setImportMode(mode);
    setImportCode(code);
    setImportKey((k) => k + 1);
    setImportOpen(true);
  };

  const makeDefault = async (t: BibleTranslationDto) => {
    setPending(t.code);
    try {
      const result = await setBibleLanguageDefaultAction(t.code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${t.name} is now the ${t.languageName} Bible`);
      router.refresh();
    } catch {
      toast.error('Could not change the default Bible');
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = async () => {
    const t = deleting;
    if (!t) return;
    setPending(t.code);
    try {
      const result = await deleteBibleTranslationAction(t.code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${t.name}`);
      setDeleting(null);
      router.refresh();
    } catch {
      toast.error('Could not delete the translation');
    } finally {
      setPending(null);
    }
  };

  const sameLanguage = deleting
    ? translations.filter((t) => t.language === deleting.language && t.code !== deleting.code)
    : [];

  return (
    <>
      <PageHeader
        title="Bible"
        description="The Scripture texts translations quote from, and how each one numbers its verses against RSV-CE"
        actions={
          translations.length > 0 && (
            <Button onClick={() => openImport()}>
              <Upload />
              Import
            </Button>
          )
        }
      />

      <div className="px-4 py-4">
        {translations.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen />
              </EmptyMedia>
              <EmptyTitle>No Bible imported yet</EmptyTitle>
              <EmptyDescription>
                Import RSV-CE first: references are written against it. Then import each target language&apos;s Bible
                with its versification file.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => openImport()}>
                <Upload />
                Import a Bible
              </Button>
              <p className="text-sm text-muted-foreground">
                Or import all seven from a bible-api checkout on the server:{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                  pnpm bible:import &lt;bible-api data dir&gt;
                </code>
              </p>
            </EmptyContent>
          </Empty>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Translation</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead className="text-right">Books</TableHead>
                  <TableHead className="text-right">Verses</TableHead>
                  <TableHead>Versification</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {translations.map((t) => (
                  <TableRow key={t.code}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <Link
                        href={`/admin/bible/${t.code}`}
                        className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {t.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <code className="text-xs text-muted-foreground">{t.code}</code>
                        <Badge variant={t.role === 'source' ? 'default' : 'outline'}>
                          {t.role === 'source' ? 'Source' : 'Target'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span>{t.languageName}</span>
                        <span className="text-xs text-muted-foreground">{t.language}</span>
                      </div>
                      {t.isLanguageDefault && (
                        <Badge
                          variant="secondary"
                          className="mt-0.5"
                          title={`Documents in ${t.languageName} quote this Bible`}
                        >
                          <Star aria-hidden="true" />
                          Language default
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(t.bookCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(t.verseCount)}</TableCell>
                    <TableCell>
                      <CoverageMeter coverage={t.versification} role={t.role} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <time dateTime={t.importedAt} title={formatExactDateTime(t.importedAt)}>
                        {formatUnambiguousDate(t.importedAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`} />}
                          disabled={pending === t.code}
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/bible/${t.code}`)}>
                            <BookOpen />
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={t.isLanguageDefault} onClick={() => makeDefault(t)}>
                            <BookOpenCheck />
                            {t.isLanguageDefault
                              ? `Default for ${t.languageName}`
                              : `Make default for ${t.languageName}`}
                          </DropdownMenuItem>
                          {t.role === 'target' && (
                            <DropdownMenuItem onClick={() => openImport('versification', t.code)}>
                              <FileUp />
                              Replace versification…
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(t)}>
                            <Trash2 />
                            Delete…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <ImportBibleDialog
        // Remount per opening so the mode and code it was opened with take effect.
        key={importKey}
        open={importOpen}
        onOpenChange={setImportOpen}
        translations={translations}
        initialMode={importMode}
        initialCode={importCode}
        onImported={() => router.refresh()}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              {deleting && (
                <div className="space-y-2">
                  <p>
                    This removes <strong>{deleting.code}</strong>: {formatCount(deleting.bookCount)} books,{' '}
                    {formatCount(deleting.verseCount)} verses, their section headers
                    {deleting.role === 'target' && ', and every versification declaration, mapping row and review mark'}
                    .
                  </p>
                  <p>
                    {deleting.role === 'source'
                      ? 'Without the source, no reference can be resolved in any language until it is imported again.'
                      : sameLanguage.length === 0
                        ? `${deleting.languageName} documents will have no Bible to quote from.`
                        : deleting.isLanguageDefault
                          ? `It is the ${deleting.languageName} default; make ${sameLanguage.map((t) => t.code).join(' or ')} the default afterwards.`
                          : `${deleting.languageName} documents keep quoting the default translation.`}{' '}
                    Importing the file again restores the text, not edits made here.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Cancel</AlertDialogCancel>
            {/* A plain button, not a Close: the dialog stays open until the delete settles. */}
            <Button variant="destructive" disabled={pending !== null} onClick={() => void confirmDelete()}>
              Delete translation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
