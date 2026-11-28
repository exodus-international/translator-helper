'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { moveStandardTranslationToGeneralAction } from '@/domain/standard-translation/standard-translation.actions';
import type { StandardTranslationRow } from '@/domain/standard-translation/standard-translation.repository';
import type { MoveKeep } from '@/domain/standard-translation/standard-translation.types';
import { capture } from '@/lib/analytics';
import { entryLabel } from '@/domain/standard-translation/entry-label';

/** A project entry about to become general, and the general entry with the same source, if any. */
export interface PendingMove {
  entry: StandardTranslationRow;
  conflict: StandardTranslationRow | null;
}

/**
 * Confirms moving a project entry to all projects. When a general entry with
 * the same source exists, only one of the two can stay, so the dialog shows
 * both and the choice is sent as `keep`.
 */
export function MoveToGeneralDialog({
  open,
  pending,
  languageName,
  onOpenChange,
  onMoved,
  move = moveStandardTranslationToGeneralAction,
}: {
  open: boolean;
  /** Kept while the dialog closes, so it doesn't go blank as it fades out. */
  pending: PendingMove | null;
  languageName: string;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
  /** The action, replaceable so a test sees what would be sent. */
  move?: typeof moveStandardTranslationToGeneralAction;
}) {
  const [moving, setMoving] = useState(false);

  const handleMove = async (keep?: MoveKeep) => {
    if (!pending) return;
    setMoving(true);
    try {
      await move(pending.entry.id, keep ? { keep } : {});
      capture('standard_translation_moved', { kept: keep ?? 'project' });
      toast.success(
        keep === 'general'
          ? `Kept the general standard translation of “${entryLabel(pending.conflict ?? pending.entry)}”`
          : `“${entryLabel(pending.entry)}” now applies to all projects`,
      );
      onMoved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The standard translation could not be moved');
    } finally {
      setMoving(false);
    }
  };

  const projectName = pending?.entry.sourceProject?.name ?? 'this project';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={pending?.conflict ? 'sm:max-w-2xl' : undefined}>
        {pending && !pending.conflict && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Move to all projects?</AlertDialogTitle>
              <AlertDialogDescription>
                “{entryLabel(pending.entry)}” will apply to every project in {languageName}, not only {projectName}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={moving}>Cancel</AlertDialogCancel>
              <Button onClick={() => handleMove()} disabled={moving}>
                Move to all projects
              </Button>
            </AlertDialogFooter>
          </>
        )}
        {pending?.conflict && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>A general standard translation has the same source</AlertDialogTitle>
              <AlertDialogDescription>
                Only one of them can apply to all projects in {languageName}. The other one is deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <EntrySummary heading={`This one · ${projectName}`} entry={pending.entry} />
              <EntrySummary heading="The general one · All projects" entry={pending.conflict} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={moving}>Cancel</AlertDialogCancel>
              <Button variant="outline" onClick={() => handleMove('general')} disabled={moving}>
                Keep the general one
              </Button>
              <Button onClick={() => handleMove('project')} disabled={moving}>
                Keep this one
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EntrySummary({ heading, entry }: { heading: string; entry: StandardTranslationRow }) {
  return (
    <section aria-label={heading} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3 text-sm">
      <h3 className="text-muted-foreground text-xs font-medium">{heading}</h3>
      {entry.name && <p className="font-medium">{entry.name}</p>}
      <p className="text-muted-foreground whitespace-pre-line">{entry.sourceText}</p>
      <p className="whitespace-pre-line">{entry.targetText}</p>
      {entry.fixedForm && <Badge variant="secondary">Fixed form</Badge>}
      {entry.updatedBy && <p className="text-muted-foreground text-xs">Last changed by {entry.updatedBy.name}</p>}
    </section>
  );
}
