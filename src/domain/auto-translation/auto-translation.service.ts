import {
  cancelAutoTranslations,
  enableAutoTranslate,
  enqueueAutoTranslations,
  getAutoTranslateProject,
  listAutoTranslateProjects,
  retryAutoTranslations,
  setAutoTranslate,
} from './auto-translation.repository';
import { wakeAutoTranslationWorker } from './auto-translation.worker';

/**
 * Turning the setting on or off, and queueing work while it is on. Who may do
 * it is the server action's business; this is what it does.
 *
 * On: every version nobody has started is queued, in the same transaction
 * as the setting. Off: queued, running and failed jobs are cancelled, and a
 * job already talking to the model discards its result. Versions already
 * drafted keep their text, their status and their AI original.
 */
export async function setProjectAutoTranslate(translationProjectId: string, enabled: boolean, userId: string) {
  const project = await getAutoTranslateProject(translationProjectId);
  if (!project) throw new Error('Translation project not found');

  if (!enabled) {
    await setAutoTranslate(translationProjectId, false, userId);
    const cancelled = await cancelAutoTranslations(translationProjectId);
    return { enabled, queued: 0, cancelled };
  }

  const queued = await enableAutoTranslate(project, userId);
  if (queued > 0) wakeAutoTranslationWorker();
  return { enabled, queued, cancelled: 0 };
}

/**
 * A document added to a source project: queued for every language that has
 * the setting on. The job is the setting's work, so it is logged under
 * whoever turned the setting on, not whoever uploaded the document. Should
 * this fail, the worker's sweep queues the document later.
 */
export async function queueNewDocuments(sourceProjectId: string, documentIds: string[]) {
  const projects = await listAutoTranslateProjects(sourceProjectId);
  let queued = 0;
  for (const { id } of projects) {
    const project = await getAutoTranslateProject(id);
    if (!project?.autoTranslate) continue;
    queued += await enqueueAutoTranslations({ project, requestedById: null, documentIds });
  }
  if (queued > 0) wakeAutoTranslationWorker();
  return queued;
}

export async function retryProjectAutoTranslations(translationProjectId: string, jobId?: string) {
  const project = await getAutoTranslateProject(translationProjectId);
  if (!project?.autoTranslate) throw new Error('Automatic translation is off for this language.');
  const queued = await retryAutoTranslations(translationProjectId, jobId);
  if (queued > 0) wakeAutoTranslationWorker();
  return queued;
}
