'use server';

import { authorize } from '@/lib/authorize';
import { refuse } from '@/lib/action-refusal';
import {
  countAutoTranslateCandidates,
  getAutoTranslateProject,
  getAutoTranslationProgress,
} from './auto-translation.repository';
import { retryProjectAutoTranslations, setProjectAutoTranslate } from './auto-translation.service';
import { retryAutoTranslationSchema, setAutoTranslateSchema } from './auto-translation.types';

/**
 * The setting and its progress, for the project page. Anyone on the language
 * team sees it; the page polls it while work is open.
 */
export async function getAutoTranslationAction(translationProjectId: string) {
  await authorize({ project: translationProjectId, role: 'member' });

  const project = await getAutoTranslateProject(translationProjectId);
  if (!project) return null;

  const [candidates, progress] = await Promise.all([
    countAutoTranslateCandidates(project),
    getAutoTranslationProgress(translationProjectId),
  ]);
  return {
    translationProjectId,
    enabled: project.autoTranslate,
    changedAt: project.autoTranslateChangedAt,
    /** Versions nobody has started and nothing has queued: what turning it on queues now. */
    candidates,
    progress,
  };
}

export type AutoTranslationState = NonNullable<Awaited<ReturnType<typeof getAutoTranslationAction>>>;

/** Turning automatic translation on or off: the language's project manager, or an administrator. */
export async function setAutoTranslateAction(input: unknown) {
  const { translationProjectId, enabled } = setAutoTranslateSchema.parse(input);
  const { user } = await authorize({ project: translationProjectId, role: 'manager' });

  return setProjectAutoTranslate(translationProjectId, enabled, user.id);
}

/** Sending failed documents back to the queue: whoever may turn the setting on. */
export async function retryAutoTranslationAction(input: unknown) {
  const { translationProjectId, jobId } = retryAutoTranslationSchema.parse(input);
  await authorize({ project: translationProjectId, role: 'manager' });

  const project = await getAutoTranslateProject(translationProjectId);
  if (!project?.autoTranslate) {
    return refuse('Automatic translation is off for this language. Turn it on to translate these documents.');
  }
  return { queued: await retryProjectAutoTranslations(translationProjectId, jobId) };
}
