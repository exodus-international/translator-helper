import { z } from 'zod';
import { AudioProvider } from '@prisma/client';

export const TRANSLATION_INSTRUCTIONS_MAX_LENGTH = 10000;

export const createLanguageSchema = z.object({
  code: z.string().min(2).max(5), // e.g., "en", "cs", "en-US"
  name: z.string().min(2),
  branchName: z.string().optional(),
});

export const updateLanguageSchema = z.object({
  name: z.string().min(2).optional(),
});

export const updateLanguageInstructionsSchema = z.object({
  translationInstructions: z.string().max(TRANSLATION_INSTRUCTIONS_MAX_LENGTH).optional(),
});

export const updateLanguageBranchNameSchema = z.object({
  branchName: z.string().nullable(),
});

export const updateLanguageAudioSchema = z
  .object({
    audioProvider: z.enum(AudioProvider).nullable(),
    audioVoice: z.string().trim().max(100).nullable(),
  })
  .transform((v) => ({
    audioProvider: v.audioProvider,
    audioVoice: v.audioVoice || null,
  }))
  .refine((v) => !v.audioProvider || !!v.audioVoice, { message: 'A voice is required when a provider is selected' });

/**
 * Team policy: always the male voice per locale. Used as defaults when a
 * provider is first selected. Pulled from the Azure voices/list endpoint
 * (germanywestcentral, 2026-09-01); every locale except en and de has
 * exactly one male neural voice.
 */
export const DEFAULT_AUDIO_VOICES: Record<string, string> = {
  cs: 'cs-CZ-AntoninNeural',
  de: 'de-DE-ConradNeural',
  en: 'en-US-AndrewNeural',
  hr: 'hr-HR-SreckoNeural',
  hu: 'hu-HU-TamasNeural',
  lt: 'lt-LT-LeonasNeural',
  nl: 'nl-NL-MaartenNeural',
  pl: 'pl-PL-MarekNeural',
  sk: 'sk-SK-LukasNeural',
  sl: 'sl-SI-RokNeural',
};
