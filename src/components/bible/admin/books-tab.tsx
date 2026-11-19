'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookOpen, ListOrdered } from 'lucide-react';
import { useId, useState } from 'react';
import { bookStatus, compareChapters, formatCount, pluralize, unhandledChapters, type BibleBook } from './bible-admin';

const TESTAMENTS = [
  { key: 'OT', label: 'Old Testament' },
  { key: 'NT', label: 'New Testament' },
] as const;

export function BooksTab({
  role,
  books,
  onRead,
  onVersification,
}: {
  role: 'source' | 'target';
  books: BibleBook[];
  onRead: (usfm: string) => void;
  onVersification?: (usfm: string) => void;
}) {
  const id = useId();
  const [attentionOnly, setAttentionOnly] = useState(false);

  const rows = books.map((book) => {
    const status = bookStatus(book, role);
    const differing = role === 'target' ? unhandledChapters(compareChapters(book)).length : 0;
    const needsAttention =
      role === 'target' && (!book.declared || !book.reviewed || book.unmappableChapters.length > 0);
    return { book, status, differing, needsAttention };
  });
  const attentionCount = rows.filter((r) => r.needsAttention).length;
  const shown = attentionOnly ? rows.filter((r) => r.needsAttention) : rows;

  return (
    <div className="space-y-4">
      {role === 'target' && (
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-attention`}
            checked={attentionOnly}
            onCheckedChange={(c) => setAttentionOnly(c === true)}
          />
          <FieldLabel htmlFor={`${id}-attention`} className="font-normal">
            Only books that need attention ({attentionCount}): not declared, not reviewed or with unmappable chapters
          </FieldLabel>
        </Field>
      )}

      {shown.length === 0 && <p className="text-sm text-muted-foreground">Every book is declared and reviewed.</p>}

      {TESTAMENTS.map(({ key, label }) => {
        const group = shown.filter((r) => r.book.testament === key);
        if (group.length === 0) return null;
        return (
          <section key={key} aria-labelledby={`${id}-${key}`}>
            <h2 id={`${id}-${key}`} className="mb-2 text-sm font-semibold text-muted-foreground">
              {label} <span className="font-normal">({group.length})</span>
            </h2>
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead className="text-right">Chapters</TableHead>
                    <TableHead className="text-right">Verses</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.map(({ book, status, differing }) => (
                    <TableRow key={book.id}>
                      <TableCell className="whitespace-normal">
                        <span className="font-medium">{book.name}</span>{' '}
                        <span className="text-xs text-muted-foreground">
                          {book.abbreviation} <code>{book.id}</code>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{book.chapterCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(book.verseCount)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          {role === 'target' &&
                            book.declared &&
                            !book.reviewed &&
                            book.unmappableChapters.length > 0 && <Badge variant="secondary">Not reviewed</Badge>}
                          {differing > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {pluralize(differing, 'chapter')} differ{differing === 1 ? 's' : ''} from RSV-CE, unmapped
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRead(book.id)}
                            aria-label={`Read ${book.name}`}
                          >
                            <BookOpen />
                            Read
                          </Button>
                          {onVersification && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onVersification(book.id)}
                              aria-label={`Check the numbering of ${book.name}`}
                            >
                              <ListOrdered />
                              Numbering
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
