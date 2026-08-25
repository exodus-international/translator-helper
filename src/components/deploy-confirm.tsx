'use client';

import { useCallback, useRef, useState } from 'react';
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
import { getAudioReadinessAction } from '@/domain/audio/audio.actions';
import type { AudioReadiness } from '@/domain/audio/audio.types';

const WARNINGS: Partial<Record<AudioReadiness['state'], string>> = {
  missing: 'No audio has been generated for this version.',
  pending: 'Audio for this version is still being generated.',
  failed: 'Audio generation for this version failed.',
  stale: 'The audio was generated from an older version of the text.',
};

/**
 * Deploy guard shared by every place that can move a version to DEPLOYED.
 * `confirmDeploy` resolves true when the deploy may proceed: immediately when
 * the audio is ready or not applicable, otherwise after the admin chooses
 * "Deploy anyway" in the dialog. A speech outage never blocks a deploy.
 */
export function useDeployConfirm() {
  const [warning, setWarning] = useState<string | null>(null);
  const resolver = useRef<((proceed: boolean) => void) | null>(null);

  const confirmDeploy = useCallback(async (versionId: string): Promise<boolean> => {
    let readiness: AudioReadiness;
    try {
      readiness = await getAudioReadinessAction(versionId);
    } catch (error) {
      console.error('[DeployConfirm] Could not check audio readiness:', error);
      return true;
    }
    const message = WARNINGS[readiness.state];
    if (!message) return true;

    setWarning(message);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (proceed: boolean) => {
    setWarning(null);
    resolver.current?.(proceed);
    resolver.current = null;
  };

  const dialog = (
    <AlertDialog open={warning !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deploy without audio?</AlertDialogTitle>
          <AlertDialogDescription>
            {warning} The pull request will not include an audio link. You can deploy the text now and regenerate the
            audio later, or cancel and wait for it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>Deploy anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmDeploy, dialog };
}
