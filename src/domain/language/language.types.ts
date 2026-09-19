import { z } from 'zod';
import { AudioProvider } from '@/generated/prisma/enums';

export const TRANSLATION_INSTRUCTIONS_MAX_LENGTH = 10000;

/**
 * A branch is required from the moment a language exists. Every language has at
 * least one project that deploys, so an absent branch is not a configuration
 * an admin might have meant -- it is a deploy that will throw, which is exactly
 * the failure the language pages exist to move forward in time.
 */
export const createLanguageSchema = z.object({
  code: z.string().trim().min(2).max(5), // e.g., "en", "cs", "en-US"
  name: z.string().trim().min(2),
  branchName: z.string().trim().min(1),
});

/**
 * `code` is the URL: /languages/hr and /documents/exodus90/day-1/hr both key off
 * it. Immutability used to be an accident of the admin form disabling the input
 * -- a strict object makes the action itself reject a change, which is where the
 * rule has to live for those URLs to be safe.
 */
export const updateLanguageSettingsSchema = z
  .strictObject({
    name: z.string().trim().min(2),
    branchName: z.string().trim().min(1).nullable(),
    audioProvider: z.enum(AudioProvider).nullable(),
    audioVoice: z.string().trim().max(100).nullable(),
  })
  .transform((v) => ({ ...v, audioVoice: v.audioVoice || null }))
  .refine((v) => !v.audioProvider || !!v.audioVoice, { message: 'A voice is required when a provider is selected' });

export const updateLanguageInstructionsSchema = z.object({
  translationInstructions: z.string().max(TRANSLATION_INSTRUCTIONS_MAX_LENGTH).optional(),
});

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
