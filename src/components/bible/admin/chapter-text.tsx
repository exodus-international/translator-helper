import type { ChapterDto } from '@/domain/bible/bible.service';
import { Fragment } from 'react';

/** A chapter as it reads: section headers where the translation puts them, verse numbers inline. */
export function ChapterText({ chapter, lang }: { chapter: ChapterDto; lang?: string }) {
  const headersBefore = new Map<number, string[]>();
  for (const h of chapter.headers) {
    headersBefore.set(h.beforeVerse, [...(headersBefore.get(h.beforeVerse) ?? []), h.title]);
  }
  const placed = new Set<number>();

  return (
    <div lang={lang ?? chapter.language} className="max-w-prose space-y-3 font-serif text-base leading-relaxed">
      {chapter.verses.map((v) => {
        // A header sits before the first verse at or after its number, so one
        // pointing into a merged verse is still shown.
        const titles: string[] = [];
        for (const [before, list] of headersBefore) {
          if (!placed.has(before) && before <= v.verse) {
            titles.push(...list);
            placed.add(before);
          }
        }
        return (
          <Fragment key={v.id}>
            {titles.map((title) => (
              <h3 key={`${v.id}-${title}`} className="pt-2 font-sans text-sm font-semibold text-foreground">
                {title}
              </h3>
            ))}
            <p>
              <sup className="mr-1 font-sans text-[0.7em] font-medium text-muted-foreground tabular-nums">
                {v.verse_end ? `${v.verse}–${v.verse_end}` : v.verse}
              </sup>
              {v.text}
            </p>
          </Fragment>
        );
      })}
    </div>
  );
}
