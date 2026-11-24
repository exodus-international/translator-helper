'use client';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  addBibleMappingAction,
  deleteBibleMappingAction,
  getBibleChapterAction,
  listBibleMappingsAction,
  setBibleBookDeclarationAction,
} from '@/domain/bible/bible.actions';
import { mapVerse } from '@/domain/bible/lib/versification';
import { cn } from '@/lib/utils';
import { Columns2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  alignVerses,
  bookStatus,
  compareChapters,
  describeMapping,
  pluralize,
  unhandledChapters,
  type BibleBook,
  type MappingRowView,
} from './bible-admin';
import { BookSelect, ChapterSelect } from './reader-tab';
import { useActionData } from './use-action-data';

type Outcome = { ok: true } | { ok: false; error: string };

interface Declaration {
  reviewed: boolean;
  note: string | null;
  rows: MappingRowView[];
}

export function VersificationTab({
  code,
  sourceCode,
  books,
  book: usfm,
  onBookChange,
}: {
  code: string;
  sourceCode: string | null;
  books: BibleBook[];
  book: string;
  onBookChange: (usfm: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const book = books.find((b) => b.id === usfm) ?? books[0];
  const [busy, setBusy] = useState(false);
  const [compareChapter, setCompareChapter] = useState<number | null>(null);
  const [formChapter, setFormChapter] = useState<{ chapter: number; nonce: number } | null>(null);
  const [differingOnly, setDifferingOnly] = useState(false);
  const declaration = useActionData<Declaration | null>(book ? `${code}:${book.id}` : null, () =>
    listBibleMappingsAction(code, book!.id),
  );

  if (!book) return <p className="text-sm text-muted-foreground">This translation has no books.</p>;

  const chapters = compareChapters(book);
  const unhandled = unhandledChapters(chapters);
  const status = bookStatus(book, 'target');
  const rows = declaration.data?.rows ?? [];
  const shownChapters = differingOnly ? chapters.filter((c) => c.differs || c.mapped || c.unmappable) : chapters;

  /** Runs an admin action, reports its refusal, and reloads what it changed. */
  const run = async (work: () => Promise<Outcome>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(success);
      declaration.reload();
      router.refresh();
      return true;
    } catch {
      toast.error('That change was not saved. Check the values and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selectBook = (next: string) => {
    setCompareChapter(null);
    setFormChapter(null);
    onBookChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        References are written against RSV-CE. A declared book resolves with the same chapter and verse numbers unless a
        mapping row says otherwise; an undeclared book or an unmappable chapter is never resolved, so a wrong verse is
        never quoted.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-64 max-w-full">
          <FieldLabel htmlFor={`${id}-book`}>Book</FieldLabel>
          <BookSelect id={`${id}-book`} books={books} value={book.id} onChange={selectBook} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {book.declared && !book.reviewed && <Badge variant="secondary">Not reviewed</Badge>}
          {unhandled.length > 0 && (
            <span className="text-sm text-warning">
              {pluralize(unhandled.length, 'chapter')} with a different verse count and no mapping
            </span>
          )}
        </div>
      </div>

      <DeclarationCard
        key={`${book.id}:${declaration.loading ? 'loading' : 'loaded'}`}
        book={book}
        declaration={declaration.data ?? null}
        loading={declaration.loading}
        busy={busy}
        onChange={(declared, extra) =>
          run(
            () => setBibleBookDeclarationAction({ code, usfm: book.id, declared, ...extra }),
            declared
              ? extra?.reviewed !== undefined
                ? extra.reviewed
                  ? `${book.name} marked reviewed`
                  : `${book.name} marked not reviewed`
                : extra?.note !== undefined
                  ? 'Note saved'
                  : `${book.name} declared`
              : `${book.name} undeclared`,
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">Verses per chapter</CardTitle>
            <CardDescription>
              RSV-CE beside this translation. Differences are where numbering may shift.
            </CardDescription>
            <Field orientation="horizontal" className="pt-1">
              <Checkbox
                id={`${id}-differing`}
                checked={differingOnly}
                onCheckedChange={(c) => setDifferingOnly(c === true)}
              />
              <FieldLabel htmlFor={`${id}-differing`} className="font-normal">
                Only chapters that differ or have a mapping
              </FieldLabel>
            </Field>
          </CardHeader>
          <div className="max-h-[32rem] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Chapter</TableHead>
                  <TableHead className="text-right">RSV-CE</TableHead>
                  <TableHead className="text-right">This</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Mapping</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownChapters.map((c) => (
                  <TableRow
                    key={c.chapter}
                    className={cn(
                      c.differs && !c.mapped && !c.unmappable && 'bg-warning/5',
                      compareChapter === c.chapter && 'bg-muted',
                    )}
                  >
                    <TableCell className="font-medium tabular-nums">{c.chapter}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.source ?? '–'}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.target ?? '–'}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', c.differs && 'font-medium text-warning')}>
                      {c.delta === null
                        ? c.differs
                          ? 'missing'
                          : ''
                        : c.delta === 0
                          ? ''
                          : c.delta > 0
                            ? `+${c.delta}`
                            : `−${-c.delta}`}
                    </TableCell>
                    <TableCell>
                      {c.unmappable ? (
                        <Badge variant="warning">Unmappable</Badge>
                      ) : c.mapped ? (
                        <Badge variant="secondary">Mapped</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Compare chapter ${c.chapter} with RSV-CE`}
                          aria-pressed={compareChapter === c.chapter}
                          disabled={!sourceCode}
                          onClick={() => setCompareChapter(compareChapter === c.chapter ? null : c.chapter)}
                        >
                          <Columns2 />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Add a mapping row for chapter ${c.chapter}`}
                          disabled={!book.declared}
                          onClick={() => setFormChapter({ chapter: c.chapter, nonce: Date.now() })}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">Mapping rows</CardTitle>
            <CardDescription>
              Each row moves part of RSV-CE onto this translation&apos;s numbering, for example &ldquo;Source 51:1–19 →
              target 51, verse +2&rdquo;: RSV-CE Psalm 51:1 is verse 3 here. A verse range beats a whole-chapter row.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 py-3">
            {declaration.loading ? (
              <Skeleton className="h-16 w-full" />
            ) : !book.declared ? (
              <p className="text-sm text-muted-foreground">Declare the book to add mapping rows.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rows: every chapter and verse keeps its RSV-CE number.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className={cn(row.unmappable && 'text-warning')}>{describeMapping(row)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete the row: ${describeMapping(row)}`}
                      disabled={busy}
                      onClick={() => run(() => deleteBibleMappingAction(code, row.id), 'Mapping row deleted')}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {book.declared && (
              <MappingForm
                key={`${book.id}:${formChapter?.nonce ?? 0}`}
                chapterCount={Math.max(book.sourceChapterVerseCounts.length, book.chapterCount)}
                initialChapter={formChapter?.chapter ?? unhandled[0]?.chapter ?? 1}
                busy={busy}
                onAdd={(row) => run(() => addBibleMappingAction({ code, usfm: book.id, ...row }), 'Mapping row added')}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {compareChapter !== null && sourceCode && (
        <ChapterComparisonPanel
          key={`${book.id}:${compareChapter}`}
          code={code}
          sourceCode={sourceCode}
          book={book}
          chapter={compareChapter}
          rows={rows}
          declared={book.declared}
          onClose={() => setCompareChapter(null)}
        />
      )}
    </div>
  );
}

function DeclarationCard({
  book,
  declaration,
  loading,
  busy,
  onChange,
}: {
  book: BibleBook;
  declaration: Declaration | null;
  loading: boolean;
  busy: boolean;
  onChange: (declared: boolean, extra?: { reviewed?: boolean; note?: string | null }) => Promise<boolean>;
}) {
  const id = useId();
  const [note, setNote] = useState(declaration?.note ?? '');
  const [confirmUndeclare, setConfirmUndeclare] = useState(false);
  const rowCount = declaration?.rows.length ?? 0;
  const savedNote = declaration?.note ?? '';

  const toggleDeclared = (next: boolean) => {
    if (!next && rowCount > 0) {
      setConfirmUndeclare(true);
      return;
    }
    void onChange(next);
  };

  return (
    <Card className="px-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
        <div className="space-y-3">
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-declared`}
              checked={book.declared}
              disabled={busy || loading}
              onCheckedChange={(c) => toggleDeclared(c === true)}
            />
            <div>
              <FieldLabel htmlFor={`${id}-declared`}>Declared</FieldLabel>
              <FieldDescription>
                {book.declared
                  ? 'The numbering has been checked against RSV-CE; references to this book resolve.'
                  : 'References to this book are refused until its numbering is declared.'}
              </FieldDescription>
            </div>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-reviewed`}
              checked={book.reviewed}
              disabled={busy || loading || !book.declared}
              onCheckedChange={(c) => void onChange(true, { reviewed: c === true })}
            />
            <div>
              <FieldLabel htmlFor={`${id}-reviewed`}>Reviewed</FieldLabel>
              <FieldDescription>A person compared the chapters and checked the mapping rows.</FieldDescription>
            </div>
          </Field>
        </div>
        <Field className="flex-1">
          <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
          <Textarea
            id={`${id}-note`}
            value={note}
            maxLength={2000}
            rows={2}
            disabled={!book.declared || loading}
            placeholder={
              book.declared ? 'What differs in this book, and where it was checked' : 'Declare the book to add a note'
            }
            onChange={(e) => setNote(e.target.value)}
          />
          {book.declared && note !== savedNote && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setNote(savedNote)} disabled={busy}>
                Discard
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void onChange(true, { note: note.trim() || null })}>
                Save note
              </Button>
            </div>
          )}
        </Field>
      </div>

      <AlertDialog open={confirmUndeclare} onOpenChange={setConfirmUndeclare}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undeclare {book.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes its {pluralize(rowCount, 'mapping row')}, its review mark and its note. References to{' '}
              {book.name} stop resolving in this translation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (await onChange(false)) setConfirmUndeclare(false);
              }}
            >
              Undeclare
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type NewRow = Omit<MappingRowView, 'id'>;

function MappingForm({
  chapterCount,
  initialChapter,
  busy,
  onAdd,
}: {
  chapterCount: number;
  initialChapter: number;
  busy: boolean;
  onAdd: (row: NewRow) => Promise<boolean>;
}) {
  const id = useId();
  const [srcChapter, setSrcChapter] = useState(String(initialChapter));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dstChapter, setDstChapter] = useState('');
  const [offset, setOffset] = useState('0');
  const [unmappable, setUnmappable] = useState(false);

  const int = (v: string) => (v.trim() === '' ? null : Number(v));
  const src = int(srcChapter);
  const row: NewRow | null =
    src !== null && Number.isInteger(src) && src >= 1
      ? {
          srcChapter: src,
          srcVerseFrom: int(from),
          srcVerseTo: int(from) === null ? null : int(to),
          dstChapter: int(dstChapter) ?? src,
          offset: unmappable ? 0 : (int(offset) ?? 0),
          unmappable,
        }
      : null;

  const problem = !row
    ? 'Give the RSV-CE chapter.'
    : row.srcChapter > 200 || row.dstChapter < 1 || row.dstChapter > 200
      ? 'Chapters run from 1 to 200.'
      : int(to) !== null && row.srcVerseFrom === null
        ? 'A verse range needs a first verse.'
        : row.srcVerseFrom !== null && row.srcVerseTo !== null && row.srcVerseTo < row.srcVerseFrom
          ? 'The last verse comes before the first.'
          : [row.srcVerseFrom, row.srcVerseTo, row.offset].some((n) => n !== null && !Number.isInteger(n))
            ? 'Use whole numbers.'
            : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row || problem) return;
    if (await onAdd(row)) {
      setFrom('');
      setTo('');
      setOffset('0');
      setUnmappable(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-dashed p-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-medium">
        Add a row
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <NumberField
          id={`${id}-src`}
          label="RSV-CE chapter"
          value={srcChapter}
          onChange={setSrcChapter}
          min={1}
          max={chapterCount || 200}
        />
        <NumberField id={`${id}-from`} label="From verse" value={from} onChange={setFrom} min={0} placeholder="whole" />
        <NumberField
          id={`${id}-to`}
          label="To verse"
          value={to}
          onChange={setTo}
          min={0}
          placeholder="end"
          disabled={from === ''}
        />
        <NumberField
          id={`${id}-dst`}
          label="Target chapter"
          value={dstChapter}
          onChange={setDstChapter}
          min={1}
          placeholder={srcChapter || 'same'}
          disabled={unmappable}
        />
        <NumberField
          id={`${id}-offset`}
          label="Verse offset"
          value={offset}
          onChange={setOffset}
          disabled={unmappable}
        />
      </div>
      <Field orientation="horizontal">
        <Checkbox id={`${id}-unmappable`} checked={unmappable} onCheckedChange={(c) => setUnmappable(c === true)} />
        <FieldLabel htmlFor={`${id}-unmappable`} className="font-normal">
          Unmappable: the texts do not line up, so references here are refused
        </FieldLabel>
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn('text-sm', problem ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
          {problem ?? describeMapping(row!)}
        </p>
        <Button type="submit" size="sm" disabled={busy || problem !== null}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus />}
          Add row
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id} className="text-xs">
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="tabular-nums"
      />
    </Field>
  );
}

function ChapterComparisonPanel({
  code,
  sourceCode,
  book,
  chapter,
  rows,
  declared,
  onClose,
}: {
  code: string;
  sourceCode: string;
  book: BibleBook;
  chapter: number;
  rows: MappingRowView[];
  declared: boolean;
  onClose: () => void;
}) {
  const id = useId();
  // A whole-chapter row that moves the chapter says which target chapter to put beside it.
  const moved = rows.find((r) => r.srcChapter === chapter && r.srcVerseFrom === null && !r.unmappable);
  const [targetChapter, setTargetChapter] = useState(Math.min(moved?.dstChapter ?? chapter, book.chapterCount || 1));
  const source = useActionData(`${sourceCode}:${book.id}:${chapter}`, () =>
    getBibleChapterAction({ translation: sourceCode, book: book.id, chapter }),
  );
  const target = useActionData(`${code}:${book.id}:${targetChapter}`, () =>
    getBibleChapterAction({ translation: code, book: book.id, chapter: targetChapter }),
  );
  const aligned = alignVerses(source.data?.verses ?? [], target.data?.verses ?? []);
  const loading = source.loading || target.loading;

  return (
    <Card className="gap-0 py-0" aria-labelledby={`${id}-title`}>
      <CardHeader className="border-b py-3">
        <CardTitle id={`${id}-title`} className="text-base">
          {book.name} {chapter}: RSV-CE beside this translation
        </CardTitle>
        <CardDescription>
          Rows line up by verse number. Where the texts stop matching, the numbering shifts; the arrow shows where each
          RSV-CE verse resolves with the current rows.
        </CardDescription>
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <Field className="w-28">
            <FieldLabel htmlFor={`${id}-target`} className="text-xs">
              Target chapter
            </FieldLabel>
            <ChapterSelect
              id={`${id}-target`}
              count={book.chapterCount}
              value={targetChapter}
              onChange={setTargetChapter}
            />
          </Field>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left">
                <th className="w-12 px-3 py-2 font-medium">Verse</th>
                <th className="px-3 py-2 font-medium">RSV-CE {chapter}</th>
                <th className="px-3 py-2 font-medium">This translation {targetChapter}</th>
              </tr>
            </thead>
            <tbody>
              {aligned.map((r) => {
                const mapped =
                  declared && r.source && !r.source.continued ? mapVerse(rows, chapter, r.verse) : undefined;
                const identity = mapped && mapped.chapter === chapter && mapped.verse === r.verse;
                return (
                  <tr
                    key={r.verse}
                    className={cn('border-b align-top last:border-0', (!r.source || !r.target) && 'bg-warning/5')}
                  >
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.verse}</td>
                    <td className="px-3 py-2">
                      <VerseCell cell={r.source} />
                      {mapped === null && <span className="mt-1 block text-xs text-warning">Unmappable</span>}
                      {mapped && !identity && (
                        <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                          → {mapped.chapter}:{mapped.verse}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" lang={target.data?.language}>
                      <VerseCell cell={r.target} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!target.data && (
            <p className="p-4 text-sm text-muted-foreground">Chapter {targetChapter} is not in this translation.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function VerseCell({ cell }: { cell: ReturnType<typeof alignVerses>[number]['source'] }) {
  if (!cell) return <span className="text-muted-foreground">–</span>;
  if (cell.continued) return <span className="text-xs text-muted-foreground">(part of {cell.label})</span>;
  return (
    <span className="font-serif leading-relaxed">
      {cell.label.includes('–') && (
        <sup className="mr-1 font-sans text-[0.7em] text-muted-foreground tabular-nums">{cell.label}</sup>
      )}
      {cell.text}
    </span>
  );
}
