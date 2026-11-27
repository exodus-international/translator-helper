'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Edit } from '@/domain/scripture/scripture-check';
import { entryLabel } from '@/domain/standard-translation/entry-label';
import type { StandardCheckItem } from '@/domain/standard-translation/standard-translation.check';
import type { StandardTranslationEditorEntry } from '@/domain/standard-translation/standard-translation.repository';
import { formatLastActive } from '@/lib/format';
import { ArrowUpRight, Check, ChevronRight, Pencil, Replace, X } from 'lucide-react';
import type { StandardHost } from './standard-context';
import { diffLines } from './standard-lines';
import { WordDiff } from './scripture-parts';

export type StandardItem = StandardCheckItem<StandardTranslationEditorEntry>;

/**
 * The entry on the Standard translations page: its language, and a search the
 * entry is found by. The page selects a language by its code; without one it
 * opens on the first language the viewer has.
 */
function standardEntryHref(entry: StandardTranslationEditorEntry, languageCode: string | null): string {
  const params = new URLSearchParams();
  if (languageCode) params.set('lang', languageCode);
  params.set('q', entry.name ?? entry.sourceText);
  return `/standard-translations?${params}`;
}

export interface StandardCardProps {
  item: StandardItem;
  host: StandardHost | null;
  /** The target language's code, for the link to the entry. */
  languageCode: string | null;
  /** The translation can't be changed here: no Use standard text. */
  readOnly: boolean;
  /** Opened by a click, so it stays until closed. */
  pinned: boolean;
  onUse: (edit: Edit) => void;
  onClose: () => void;
}

/**
 * The card over a standard translation in the translation: whether the text is
 * the team's standard wording, how it differs when it is not, and the one
 * click that writes the standard text in, keeping each line's layout.
 */
export function StandardCard({ item, host, languageCode, readOnly, pinned, onUse, onClose }: StandardCardProps) {
  if (!host) return null;
  const { entry } = item;
  const changed = item.state === 'changed';
  const title = entryLabel(entry);
  const use = !readOnly && changed ? item.edit : null;

  return (
    <div
      role="group"
      aria-label={`Standard translation: ${title}`}
      className="w-[22rem] max-w-[calc(100vw-2rem)] font-sans text-popover-foreground"
    >
      <div className="flex items-start gap-2 border-b px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            {changed ? (
              <Badge variant="warning">Changed</Badge>
            ) : (
              <Badge variant="secondary" className="bg-hue-violet/10 text-hue-violet dark:bg-hue-violet/20">
                {item.kind === 'term' ? 'Term' : 'Standard'}
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            Standard translation ·{' '}
            {entry.sourceProject ? entry.sourceProject.name : `All projects in ${host.language.name}`}
          </div>
        </div>
        {pinned && (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close" className="-mr-1 shrink-0">
            <X />
          </Button>
        )}
      </div>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {changed ? (
          <>
            <p className="text-xs text-warning">The text differs from the standard translation.</p>
            {item.diff && (
              <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  This translation against the standard
                </span>
                <div className="flex flex-col">
                  {diffLines(item.diff, entry.targetText).map((parts, i) => (
                    <WordDiff key={i} parts={parts} className="text-foreground" />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="flex items-center gap-1 text-xs text-success">
            <Check className="size-3" />
            {item.kind === 'term'
              ? `The text uses the standard term “${entry.targetText}”.`
              : 'The text is the standard translation.'}
          </p>
        )}
        <Collapsible className="text-[11px] text-muted-foreground">
          <CollapsibleTrigger className="group flex cursor-pointer items-center gap-0.5 select-none hover:text-foreground">
            <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
            English source
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mt-1 leading-relaxed whitespace-pre-line">{entry.sourceText}</p>
          </CollapsibleContent>
        </Collapsible>
        <p className="text-[11px] text-muted-foreground">
          Updated by {entry.updatedBy?.name ?? 'Unknown'} · {formatLastActive(entry.updatedAt)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/40 px-3 py-2">
        {use && (
          <Button size="xs" onClick={() => onUse(use)}>
            <Replace data-icon="inline-start" />
            Use standard text
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            onClose();
            host.editEntry(entry);
          }}
        >
          <Pencil data-icon="inline-start" />
          Edit entry
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          nativeButton={false}
          render={<a href={standardEntryHref(entry, languageCode)} target="_blank" rel="noreferrer" />}
        >
          {use ? 'Open' : 'Open in Standard translations'}
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
