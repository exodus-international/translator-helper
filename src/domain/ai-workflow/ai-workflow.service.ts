import { DocumentStatus, SuggestionType, TranslationWorkflow } from '@/generated/prisma/enums';
import { refuse, type Refusal } from '@/lib/action-refusal';
import type { AudioReadiness } from '../audio/audio.types';
import type { StatusChangeResult } from '../document-version/document-version.status-change';
import { StatusTransitionRefusedError } from '../document-version/document-version.transitions';
import {
  AI_USER_ID,
  audioTextProblems,
  deployProblems,
  locateQuote,
  MAX_AI_ATTEMPTS,
  REQUIRED_TEXT_APPROVALS,
  type TranslationWithNotes,
} from './ai-workflow.rules';

/**
 * The AI workflow, apart from who may ask for each part of it.
 *
 * Two kinds of thing move a version. People give the text a thumbs-up, and
 * the second one moves it on. The app runs the AI steps: drafting the
 * translation with notes, preparing the audio text, and deploying once the
 * audio is settled. Each AI step is claimed before it runs, so the request
 * that started it and the scheduled sweep never run it twice, and a step that
 * fails is retried by the sweep until it has failed MAX_AI_ATTEMPTS times.
 *
 * Built with `createAiWorkflow(deps)` so a test can hand in fakes for every
 * write and every model call, the way the status change is built.
 */

export interface AiStepVersion {
  id: string;
  status: DocumentStatus;
  workflow: TranslationWorkflow;
  content: string;
  version: number;
  aiAttempts: number;
  documentId: string;
  language: { name: string; code: string; translationInstructions: string | null };
  document: { title: string; originalFilename: string | null };
}

export interface AiWorkflowDeps {
  loadVersion: (versionId: string) => Promise<AiStepVersion | null>;
  /** The English text the version is translated from. */
  loadSource: (documentId: string) => Promise<{ content: string; languageName: string } | null>;
  /**
   * Marks the step as running by moving `aiAttempts` on from `expectedAttempts`.
   * False when someone else got there first: the attempts moved, or the status did.
   */
  claim: (versionId: string, status: DocumentStatus, expectedAttempts: number) => Promise<boolean>;
  /** Puts the attempts back after a run that only waited, so waiting is never counted as failing. */
  release: (versionId: string, attempts: number) => Promise<void>;
  succeed: (versionId: string) => Promise<void>;
  fail: (versionId: string, message: string, opts?: { final?: boolean }) => Promise<void>;
  saveDraft: (versionId: string, content: string) => Promise<{ version: number }>;
  /** Removes the open notes an earlier, failed run of the draft step left. */
  clearAiNotes: (versionId: string) => Promise<void>;
  /** Whether the version was ever committed to GitHub; an undone deploy is redone by hand. */
  hasDeployed: (versionId: string) => Promise<boolean>;
  /** Commits the version and opens or updates its pull request again. */
  redeploy: (versionId: string) => Promise<void>;
  createNote: (note: {
    documentVersionId: string;
    type: SuggestionType;
    comment: string;
    proposedText: string | null;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null;
    version: number;
  }) => Promise<unknown>;
  countOpenSuggestions: (versionId: string) => Promise<number>;
  addApproval: (versionId: string, userId: string) => Promise<void>;
  removeApproval: (versionId: string, userId: string) => Promise<void>;
  listApprovals: (versionId: string) => Promise<{ userId: string }[]>;
  isAudioEligible: (versionId: string) => Promise<boolean>;
  /**
   * The audio text the version would get with no edits, with the language's
   * narration, and the fingerprint that marks an edited one as current. Null
   * when the version gets no audio.
   */
  deriveAudioText: (versionId: string) => Promise<{ ssml: string; baseline: string } | null>;
  saveAudioText: (versionId: string, ssml: string, baseline: string) => Promise<void>;
  validateSsml: (ssml: string) => { message: string }[];
  voiceOf: (ssml: string) => string | null;
  audioReadiness: (versionId: string) => Promise<AudioReadiness>;
  translate: (input: {
    documentTitle: string;
    sourceLanguageName: string;
    targetLanguageName: string;
    targetLanguageCode: string;
    sourceContent: string;
    languageInstructions: string | null;
    originalFilename: string | null;
  }) => Promise<TranslationWithNotes>;
  prepareAudioText: (input: { ssml: string; languageName: string }) => Promise<string>;
  changeStatus: (input: {
    version: { id: string; status: DocumentStatus; workflow: TranslationWorkflow };
    to: DocumentStatus;
    actorId: string;
    by: 'system';
  }) => Promise<StatusChangeResult<unknown>>;
  /** Asks GitHub to merge the version's pull request once its checks pass. */
  enableAutoMerge: (versionId: string) => Promise<void>;
  log: (entry: { documentVersionId: string; userId: string; action: string; details: Record<string, unknown> }) => Promise<unknown>;
}

/** What a step run did, for the sweep's summary and the tests. */
export type StepOutcome = 'done' | 'waiting' | 'failed' | 'skipped';

type ApprovalRefusal = Refusal<{ reason: 'not_in_text_review' | 'open_suggestions' }>;

interface ApprovalState {
  approverIds: string[];
  /** Set when this approval moved the version on. */
  advancedTo?: DocumentStatus;
}

/** The statuses an AI step runs in. APPROVED is the automatic deploy. */
const AI_STEP_STATUSES: DocumentStatus[] = [
  DocumentStatus.AI_TRANSLATING,
  DocumentStatus.AI_PREPARING_AUDIO,
  DocumentStatus.APPROVED,
];

export function createAiWorkflow(deps: AiWorkflowDeps) {
  async function approveText(input: {
    version: { id: string; status: DocumentStatus; workflow: TranslationWorkflow };
    userId: string;
  }): Promise<ApprovalState | ApprovalRefusal> {
    const { version, userId } = input;
    if (version.workflow !== TranslationWorkflow.AI || version.status !== DocumentStatus.PENDING_REVIEW) {
      return refuse('This text is no longer waiting for approval. The page now shows where it is.', {
        reason: 'not_in_text_review',
      });
    }
    const open = await deps.countOpenSuggestions(version.id);
    if (open > 0) {
      return refuse(`Resolve all open comments before approving (${open} remaining)`, { reason: 'open_suggestions' });
    }

    await deps.addApproval(version.id, userId);
    await deps.log({ documentVersionId: version.id, userId, action: 'text_approved', details: {} });
    const approverIds = (await deps.listApprovals(version.id)).map((approval) => approval.userId);
    if (approverIds.length < REQUIRED_TEXT_APPROVALS) return { approverIds };

    const to = (await deps.isAudioEligible(version.id)) ? DocumentStatus.AI_PREPARING_AUDIO : DocumentStatus.APPROVED;
    try {
      await deps.changeStatus({ version, to, actorId: userId, by: 'system' });
    } catch (error) {
      if (!(error instanceof StatusTransitionRefusedError)) throw error;
      // Two people approving at once both count to two; the second move is
      // refused because the first already happened, which is fine.
      if (error.reason === 'not_allowed') return { approverIds };
      // A comment opened between the check above and the move. Take this
      // approval back, so approving again once it is resolved moves the text
      // on instead of leaving two approvals and nothing to press.
      await deps.removeApproval(version.id, userId);
      return refuse('Someone opened a comment meanwhile. Resolve it, then approve again.', {
        reason: 'open_suggestions',
      });
    }
    return { approverIds, advancedTo: to };
  }

  async function withdrawApproval(input: {
    version: { id: string; status: DocumentStatus; workflow: TranslationWorkflow };
    userId: string;
  }): Promise<ApprovalState | ApprovalRefusal> {
    const { version, userId } = input;
    if (version.workflow !== TranslationWorkflow.AI || version.status !== DocumentStatus.PENDING_REVIEW) {
      return refuse('This text is no longer waiting for approval. The page now shows where it is.', {
        reason: 'not_in_text_review',
      });
    }
    await deps.removeApproval(version.id, userId);
    await deps.log({ documentVersionId: version.id, userId, action: 'text_approval_withdrawn', details: {} });
    return { approverIds: (await deps.listApprovals(version.id)).map((approval) => approval.userId) };
  }

  /** Runs the AI step the version is waiting in, if it is waiting in one and nobody else is running it. */
  async function runStep(versionId: string): Promise<StepOutcome> {
    const version = await deps.loadVersion(versionId);
    if (!version || version.workflow !== TranslationWorkflow.AI || !AI_STEP_STATUSES.includes(version.status)) {
      return 'skipped';
    }
    if (version.aiAttempts >= MAX_AI_ATTEMPTS) return 'skipped';
    // Moved back from DEPLOYED: undoing a deploy is a person's decision, and
    // so is doing it again.
    if (version.status === DocumentStatus.APPROVED && (await deps.hasDeployed(version.id))) return 'skipped';
    if (!(await deps.claim(version.id, version.status, version.aiAttempts))) return 'skipped';

    try {
      switch (version.status) {
        case DocumentStatus.AI_TRANSLATING:
          await draft(version);
          break;
        case DocumentStatus.AI_PREPARING_AUDIO:
          await prepareAudio(version);
          break;
        case DocumentStatus.APPROVED:
          if ((await deploy(version)) === 'waiting') {
            await deps.release(version.id, version.aiAttempts);
            return 'waiting';
          }
          break;
      }
      return 'done';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A refused move will be refused again; so will a check that failed.
      const final = error instanceof NeedsPersonError || error instanceof StatusTransitionRefusedError;
      await deps.fail(version.id, message, { final });
      await deps.log({
        documentVersionId: version.id,
        userId: AI_USER_ID,
        action: 'ai_step_failed',
        details: { status: version.status, error: message },
      });
      return 'failed';
    }
  }

  async function draft(version: AiStepVersion) {
    const source = await deps.loadSource(version.documentId);
    if (!source?.content.trim()) throw new Error('The source document has no text to translate');

    const result = await deps.translate({
      documentTitle: version.document.title,
      sourceLanguageName: source.languageName,
      targetLanguageName: version.language.name,
      targetLanguageCode: version.language.code,
      sourceContent: source.content,
      languageInstructions: version.language.translationInstructions,
      originalFilename: version.document.originalFilename,
    });

    const saved = await deps.saveDraft(version.id, result.translation);
    await deps.clearAiNotes(version.id);
    for (const note of result.notes) {
      const range = locateQuote(result.translation, note.quote);
      await deps.createNote({
        documentVersionId: version.id,
        // A suggested wording needs a place to go; without one it is a comment.
        type: note.suggestion && range ? SuggestionType.CHANGE : SuggestionType.COMMENT,
        comment: range ? note.comment : `"${note.quote}": ${note.comment}`,
        proposedText: note.suggestion && range ? note.suggestion : null,
        range,
        version: saved.version,
      });
    }

    await deps.changeStatus({ version, to: DocumentStatus.PENDING_REVIEW, actorId: AI_USER_ID, by: 'system' });
    await deps.succeed(version.id);
  }

  async function prepareAudio(version: AiStepVersion) {
    const derived = await deps.deriveAudioText(version.id);
    // Audio was switched off for the language or project after approval: the
    // reviewer approves the version with no audio text to read.
    if (derived) {
      const prepared = await deps.prepareAudioText({ ssml: derived.ssml, languageName: version.language.name });
      const problems = audioTextProblems({
        derived: derived.ssml,
        prepared,
        validate: deps.validateSsml,
        voiceOf: deps.voiceOf,
      });
      if (problems.length > 0) throw new Error(problems.map((problem) => problem.message).join('; '));
      await deps.saveAudioText(version.id, prepared, derived.baseline);
    }

    await deps.changeStatus({ version, to: DocumentStatus.AUDIO_REVIEW, actorId: AI_USER_ID, by: 'system' });
    await deps.succeed(version.id);
  }

  async function deploy(version: AiStepVersion): Promise<'waiting' | 'done'> {
    // The pull request links the recording, so it waits for the recording.
    // A failed or missing recording does not hold the text back.
    const audio = await deps.audioReadiness(version.id);
    if (audio.state === 'pending') return 'waiting';

    const source = await deps.loadSource(version.documentId);
    const problems = deployProblems({
      content: version.content,
      filename: version.document.originalFilename,
      source: source?.content,
    });
    if (problems.length > 0) {
      throw new NeedsPersonError(
        `Not deployed automatically: ${problems.map((problem) => problem.message).join('; ')}`,
      );
    }

    const result = await deps.changeStatus({ version, to: DocumentStatus.DEPLOYED, actorId: AI_USER_ID, by: 'system' });
    if (result.github?.status === 'failed') {
      throw new NeedsPersonError(`Deployed, but the GitHub pull request failed: ${result.github.error}`);
    }
    if (result.github?.status === 'success') {
      try {
        await deps.enableAutoMerge(version.id);
      } catch (error) {
        throw new NeedsPersonError(
          `Deployed, but automatic merge could not be turned on: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await deps.succeed(version.id);
    return 'done';
  }

  /**
   * Finishes a deploy that reached DEPLOYED but failed at GitHub: the pull
   * request or the automatic merge. The status already says deployed, so
   * this is not a step the sweep runs; the manager's Retry calls it.
   */
  async function retryDeploy(versionId: string): Promise<StepOutcome> {
    const version = await deps.loadVersion(versionId);
    if (!version || version.workflow !== TranslationWorkflow.AI || version.status !== DocumentStatus.DEPLOYED) {
      return 'skipped';
    }
    try {
      await deps.redeploy(version.id);
      await deps.enableAutoMerge(version.id);
      await deps.succeed(version.id);
      return 'done';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.fail(version.id, message, { final: true });
      await deps.log({
        documentVersionId: version.id,
        userId: AI_USER_ID,
        action: 'ai_step_failed',
        details: { status: version.status, error: message },
      });
      return 'failed';
    }
  }

  return { approveText, withdrawApproval, runStep, retryDeploy };
}

/** A failure retrying cannot fix. Recorded as final, so the sweep leaves it for a person. */
class NeedsPersonError extends Error {}
