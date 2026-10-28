'use server';

import { authorize } from '@/lib/authorize';
import { formatIssues, parseInput } from '@/lib/validation';
import { narrationProfile, audioQuality } from '@/domain/audio/audio.narration';
import { storedPreviewText } from '@/domain/audio/audio.preview';
import { previewAudio } from '@/domain/audio/audio.service';
import {
  countLanguageDependents,
  createLanguage,
  deleteLanguage,
  getLanguageById,
  updateLanguageInstructions,
  updateLanguagePreviewText,
  updateLanguageSettings,
} from './language.repository';
import { assertLanguageDeletable } from './language-delete';
import {
  createLanguageSchema,
  previewLanguageAudioSchema,
  updateLanguageInstructionsSchema,
  updateLanguagePreviewTextSchema,
  updateLanguageSettingsSchema,
} from './language.types';

export async function createLanguageAction(input: unknown) {
  await authorize('can:manage-languages');

  const validated = parseInput(createLanguageSchema, input);
  return await createLanguage(validated.code, validated.name, validated.branchName);
}

/**
 * Name, branch, voice and narration are saved together: they are one form, and saving them
 * one action at a time is how the old admin dialog left a language half-updated
 * when the second call failed. `code` is not accepted -- the schema is strict,
 * so an attempt to change the URL is rejected here rather than relied upon to
 * be impossible in the form.
 */
export async function updateLanguageSettingsAction(id: string, input: unknown) {
  await authorize('can:manage-languages');

  const language = await getLanguageById(id);
  if (!language) {
    throw new Error('Language not found');
  }

  const validated = parseInput(updateLanguageSettingsSchema, input);

  // Nothing deploys into the source language and nothing is spoken in it, so
  // its branch and voice stay null rather than being editable and inert.
  if (language.isSource) {
    return await updateLanguageSettings(id, {
      name: validated.name,
      branchName: null,
      audioProvider: null,
      audioVoice: null,
      audioRate: null,
      audioPitch: null,
      audioSentencePauseMs: null,
      audioCommaPauseMs: null,
      audioQuality: null,
    });
  }

  if (!validated.branchName) {
    throw new Error('A GitHub branch is required: without one, every deploy of this language fails.');
  }

  return await updateLanguageSettings(id, validated);
}

/**
 * The preview sample saves on its own, as the admin types, apart from the
 * Save button: it is a scratch text, and losing it to a forgotten click is
 * worse than saving it too often. Same gate as the rest of the audio settings.
 */
export async function updateLanguagePreviewTextAction(id: string, input: unknown): Promise<void> {
  await authorize('can:manage-languages');

  const language = await getLanguageById(id);
  if (!language) {
    throw new Error('Language not found');
  }

  const { text } = parseInput(updateLanguagePreviewTextSchema, input);
  await updateLanguagePreviewText(id, storedPreviewText(language.code, text));
}

export type LanguagePreviewOutcome =
  | { ok: true; audioBase64: string; contentType: string }
  | { ok: false; error: string };

/**
 * Reads the sample aloud with what the form holds right now, saved or not.
 * Failures come back as a value: a message thrown from a server action is
 * replaced by a generic one in production, and the provider's own words are
 * what tells an admin whether the voice name or the service is wrong.
 */
export async function previewLanguageAudioAction(id: string, input: unknown): Promise<LanguagePreviewOutcome> {
  await authorize('can:manage-languages');

  const language = await getLanguageById(id);
  if (!language) {
    return { ok: false, error: 'Language not found' };
  }

  const parsed = previewLanguageAudioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error) };
  }
  const settings = parsed.data;

  try {
    const result = await previewAudio({
      provider: settings.audioProvider,
      voice: settings.audioVoice,
      text: settings.text,
      narration: narrationProfile(settings),
      quality: audioQuality(settings),
    });
    return { ok: true, audioBase64: Buffer.from(result.audio).toString('base64'), contentType: result.contentType };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The preview failed' };
  }
}

/**
 * Instructions are editorial rather than administrative: the people who know
 * how Croatian scripture quotations should read are the Croatian team, not
 * whoever happens to hold the admin flag. A language's Project Manager writes
 * them; admins still can, through the same gate.
 */
export async function updateLanguageInstructionsAction(id: string, input: unknown) {
  await authorize({ language: id, role: 'manager' });

  const validated = parseInput(updateLanguageInstructionsSchema, input);
  return await updateLanguageInstructions(id, validated.translationInstructions ?? null);
}

export async function deleteLanguageAction(id: string, confirmation: string) {
  await authorize('can:manage-languages');

  const language = await getLanguageById(id);
  if (!language) {
    throw new Error('Language not found');
  }

  assertLanguageDeletable(language, await countLanguageDependents(id), confirmation);

  return await deleteLanguage(id);
}
