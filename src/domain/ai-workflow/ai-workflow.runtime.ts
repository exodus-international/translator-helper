import prisma from '@/lib/db';
import { createActivityLog } from '../activity-log/activity-log.repository';
import { deriveAudioSsml, getAudioReadiness, isAudioEligible } from '../audio/audio.service';
import { narrationProfile } from '../audio/audio.narration';
import { transcriptBaseline } from '../audio/audio.rules';
import { validateSsml, voiceFromSsml } from '../audio/audio.ssml';
import { getSpeechProvider } from '../audio/providers/speech-provider';
import { changeStatus } from '../document-version/document-version.change-status';
import { countOpenSuggestions, createSuggestion } from '../suggestion/suggestion.repository';
import { prepareAudioText, translateWithNotes } from './ai-workflow.llm';
import {
  addReviewApproval,
  claimAiStep,
  clearAiStep,
  failAiStep,
  findDueAiSteps,
  listReviewApprovals,
  loadAiStepVersion,
  loadSourceText,
  releaseAiStep,
  removeReviewApproval,
  saveAiDraft,
} from './ai-workflow.repository';
import { AI_USER_ID } from './ai-workflow.rules';
import { createAiWorkflow, type StepOutcome } from './ai-workflow.service';

const LOG_PREFIX = '[AI workflow]';

/** The AI workflow as the app wires it: real repositories, the real model, the real deploy. */
export const aiWorkflow = createAiWorkflow({
  loadVersion: loadAiStepVersion,
  loadSource: loadSourceText,
  claim: claimAiStep,
  release: releaseAiStep,
  succeed: clearAiStep,
  fail: (versionId, message, opts) => failAiStep(versionId, message, opts?.final ?? false),
  saveDraft: saveAiDraft,
  createNote: (note) =>
    createSuggestion({
      documentVersionId: note.documentVersionId,
      userId: AI_USER_ID,
      type: note.type,
      comment: note.comment,
      proposedText: note.proposedText,
      version: note.version,
      ...(note.range ?? {}),
    }),
  countOpenSuggestions,
  addApproval: addReviewApproval,
  removeApproval: removeReviewApproval,
  listApprovals: listReviewApprovals,
  isAudioEligible,
  deriveAudioText: async (versionId) => {
    if (!(await isAudioEligible(versionId))) return null;
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { content: true, language: true },
    });
    if (!version?.language.audioProvider || !version.language.audioVoice) return null;
    const input = {
      content: version.content,
      voice: version.language.audioVoice,
      maxBreakMs: getSpeechProvider(version.language.audioProvider).maxBreakMs,
    };
    return {
      // What the Audio text tab would show: with the language's narration.
      ssml: deriveAudioSsml({ ...input, narration: narrationProfile(version.language) }),
      // What every transcript fingerprint is taken with: the default narration.
      baseline: transcriptBaseline(deriveAudioSsml(input)),
    };
  },
  saveAudioText: async (versionId, ssml, baseline) => {
    await prisma.documentVersion.update({ where: { id: versionId }, data: { audioSsml: ssml, audioSsmlBase: baseline } });
  },
  validateSsml,
  voiceOf: voiceFromSsml,
  audioReadiness: getAudioReadiness,
  translate: (input) => translateWithNotes(input),
  prepareAudioText,
  changeStatus: (input) => changeStatus(input),
  enableAutoMerge: async (versionId) => {
    if (process.env.AI_WORKFLOW_AUTO_MERGE === 'false') return;
    const { enableAutoMerge } = await import('../github/github.service');
    await enableAutoMerge(versionId);
  },
  log: createActivityLog,
});

/**
 * Runs the AI steps of the given versions one after another, each to the end
 * of the chain it can reach now: a draft that lands in review stops there, an
 * approved document goes on to deploy. Never throws; every failure is already
 * recorded on its version.
 */
export async function runAiSteps(versionIds: string[]): Promise<Record<StepOutcome, number>> {
  const tally: Record<StepOutcome, number> = { done: 0, waiting: 0, failed: 0, skipped: 0 };
  for (const id of versionIds) {
    try {
      let outcome = await aiWorkflow.runStep(id);
      // A finished step can leave the version in the next one, as approval
      // with no audio does on its way to deploy. Follow it while it moves.
      for (let hops = 0; outcome === 'done' && hops < 3; hops++) {
        const next = await aiWorkflow.runStep(id);
        if (next === 'skipped') break;
        outcome = next;
      }
      tally[outcome] += 1;
    } catch (error) {
      console.error(`${LOG_PREFIX} step for ${id} threw:`, error);
      tally.failed += 1;
    }
  }
  return tally;
}

/** The scheduled sweep: every step that is due, run now. Safe at any frequency. */
export async function sweepAiSteps(now = new Date()) {
  const due = await findDueAiSteps(now);
  const result = { checked: due.length, ...(await runAiSteps(due)) };
  if (due.length > 0) console.log(`${LOG_PREFIX} sweep:`, result);
  return result;
}
