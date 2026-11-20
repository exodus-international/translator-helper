'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getBibleChapterAction } from '@/domain/bible/bible.actions';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import type { BibleBook } from './bible-admin';
import { ChapterText } from './chapter-text';
import { useActionData } from './use-action-data';

interface Place {
  book: string;
  chapter: number;
}

export function ReaderTab({
  code,
  books,
  at,
  onNavigate,
}: {
  code: string;
  books: BibleBook[];
  at: Place;
  onNavigate: (next: Place) => void;
}) {
  const id = useId();
  const book = books.find((b) => b.id === at.book) ?? books[0];
  const chapter = useActionData(book ? `${code}:${book.id}:${at.chapter}` : null, () =>
    getBibleChapterAction({ translation: code, book: book!.id, chapter: at.chapter }),
  );

  if (!book) return <p className="text-sm text-muted-foreground">This translation has no books.</p>;

  const data = chapter.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-64 max-w-full">
          <FieldLabel htmlFor={`${id}-book`}>Book</FieldLabel>
          <BookSelect
            id={`${id}-book`}
            books={books}
            value={book.id}
            onChange={(b) => onNavigate({ book: b, chapter: 1 })}
          />
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor={`${id}-chapter`}>Chapter</FieldLabel>
          <ChapterSelect
            id={`${id}-chapter`}
            count={book.chapterCount}
            value={at.chapter}
            onChange={(c) => onNavigate({ book: book.id, chapter: c })}
          />
        </Field>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous chapter"
            disabled={!data?.prev}
            onClick={() => data?.prev && onNavigate(data.prev)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next chapter"
            disabled={!data?.next}
            onClick={() => data?.next && onNavigate(data.next)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Card className="px-6 py-5" aria-busy={chapter.loading}>
        <h2 className="text-lg font-semibold">
          {book.name} {at.chapter}
        </h2>
        {chapter.loading ? (
          <div className="max-w-prose space-y-2" aria-label="Loading the chapter">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : chapter.error ? (
          <p className="text-sm text-destructive">{chapter.error}</p>
        ) : data ? (
          <ChapterText chapter={data} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {book.name} {at.chapter} is not in this translation.
          </p>
        )}
      </Card>
    </div>
  );
}

export function BookSelect({
  id,
  books,
  value,
  onChange,
}: {
  id: string;
  books: Pick<BibleBook, 'id' | 'name'>[];
  value: string;
  onChange: (usfm: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => v && onChange(v)}
      items={Object.fromEntries(books.map((b) => [b.id, b.name]))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {books.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChapterSelect({
  id,
  count,
  value,
  onChange,
}: {
  id: string;
  count: number;
  value: number;
  onChange: (chapter: number) => void;
}) {
  const chapters = Array.from({ length: count }, (_, i) => String(i + 1));
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => v && onChange(Number(v))}
      items={Object.fromEntries(chapters.map((c) => [c, c]))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {chapters.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
