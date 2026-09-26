'use client';

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
import type { DiscardPrompt } from './use-suggestion-authoring';

/** Asks before unsaved feedback, or an unsaved audio text draft, is lost. */
export function DiscardDialog({ prompt }: { prompt: DiscardPrompt }) {
  const audio = prompt.kind === 'audioText';
  return (
    <AlertDialog
      open={prompt.open}
      onOpenChange={(open) => {
        if (!open) prompt.onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{audio ? 'Discard unsaved audio text?' : 'Discard unsaved suggestion?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {audio
              ? 'The audio text has changes that have not been saved. Leaving this tab loses them.'
              : 'You have unsaved changes in your suggestion. Are you sure you want to discard them?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={prompt.onCancel}>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={prompt.onConfirm}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
