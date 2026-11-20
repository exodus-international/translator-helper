'use client';

import { PageHeader } from '@/components/page-header';
import { formatCount, type BibleBook } from '@/components/bible/admin/bible-admin';
import { BooksTab } from '@/components/bible/admin/books-tab';
import { CoverageMeter } from '@/components/bible/admin/coverage-meter';
import { PlaygroundTab } from '@/components/bible/admin/playground-tab';
import { ReaderTab } from '@/components/bible/admin/reader-tab';
import { VersificationTab } from '@/components/bible/admin/versification-tab';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import { formatExactDateTime, formatUnambiguousDate } from '@/lib/format';
import { useTrailStore } from '@/lib/page-trail';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';

export type BibleTab = 'books' | 'read' | 'versification' | 'try';

interface Props {
  translation: BibleTranslationDto;
  books: BibleBook[];
  sourceCode: string | null;
  initialTab: BibleTab;
  initialBook?: string;
}

export default function BibleTranslationClient({ translation, books, sourceCode, initialTab, initialBook }: Props) {
  const [tab, setTab] = useState<BibleTab>(initialTab);
  const [readAt, setReadAt] = useState<{ book: string; chapter: number }>({
    book: initialBook ?? books[0]?.id ?? 'GEN',
    chapter: 1,
  });
  const [versificationBook, setVersificationBook] = useState<string>(
    initialBook ?? books.find((b) => !b.declared)?.id ?? books[0]?.id ?? 'GEN',
  );
  const publish = useTrailStore((s) => s.publish);
  const isTarget = translation.role === 'target';

  useEffect(
    () => publish([{ label: 'Admin' }, { label: 'Bible', href: '/admin/bible' }, { label: translation.name }]),
    [publish, translation.name],
  );

  // The tab and book live in the URL so a reload or a shared link opens the same view.
  const remember = (next: BibleTab, book?: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', next);
    if (book) params.set('book', book);
    else params.delete('book');
    window.history.replaceState(null, '', `?${params}`);
  };

  const changeTab = (next: BibleTab) => {
    setTab(next);
    remember(next, next === 'versification' ? versificationBook : next === 'read' ? readAt.book : undefined);
  };

  const openReader = (book: string, chapter = 1) => {
    setReadAt({ book, chapter });
    setTab('read');
    remember('read', book);
  };

  const openVersification = (book: string) => {
    setVersificationBook(book);
    setTab('versification');
    remember('versification', book);
  };

  return (
    <>
      <PageHeader
        title={translation.name}
        description={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <code className="text-xs">{translation.code}</code>
            <span>
              {translation.languageName} ({translation.language})
            </span>
            <Badge variant={isTarget ? 'outline' : 'default'}>{isTarget ? 'Target' : 'Source'}</Badge>
            {translation.isLanguageDefault && (
              <Badge variant="secondary">
                <Star aria-hidden="true" />
                Language default
              </Badge>
            )}
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:flex-wrap sm:items-start">
          <Stat label="Books" value={formatCount(translation.bookCount)} />
          <Stat label="Verses" value={formatCount(translation.verseCount)} />
          <div className="col-span-2 min-w-56">
            <dt className="text-xs text-muted-foreground">Versification</dt>
            <dd className="mt-1">
              <CoverageMeter coverage={translation.versification} role={translation.role} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Imported</dt>
            <dd className="font-medium">
              <time dateTime={translation.importedAt} title={formatExactDateTime(translation.importedAt)}>
                {formatUnambiguousDate(translation.importedAt)}
              </time>
            </dd>
          </div>
        </dl>
      </PageHeader>

      <div className="px-4 py-4">
        <Tabs value={tab} onValueChange={(v) => changeTab(v as BibleTab)}>
          <TabsList variant="line" className="max-w-full">
            <TabsTrigger value="books">Books</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
            {isTarget && <TabsTrigger value="versification">Versification</TabsTrigger>}
            <TabsTrigger value="try">Try it</TabsTrigger>
          </TabsList>
          <TabsContent value="books" className="pt-2">
            <BooksTab
              role={translation.role}
              books={books}
              onRead={openReader}
              onVersification={isTarget ? openVersification : undefined}
            />
          </TabsContent>
          <TabsContent value="read" className="pt-2">
            <ReaderTab
              code={translation.code}
              books={books}
              at={readAt}
              onNavigate={(next) => {
                setReadAt(next);
                remember('read', next.book);
              }}
            />
          </TabsContent>
          {isTarget && (
            <TabsContent value="versification" className="pt-2">
              <VersificationTab
                code={translation.code}
                sourceCode={sourceCode}
                books={books}
                book={versificationBook}
                onBookChange={(b) => {
                  setVersificationBook(b);
                  remember('versification', b);
                }}
              />
            </TabsContent>
          )}
          {/* Kept mounted so resolved results survive a look at another tab. */}
          <TabsContent value="try" className="pt-2" keepMounted>
            <PlaygroundTab translation={translation} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
