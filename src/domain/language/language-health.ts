/**
 * Four things decide whether a language can produce anything, and all four fail
 * at the point of use rather than at configuration time: a deploy throws when
 * `branchName` is unset, approval returns `no_voice_for_language` silently when
 * `audioVoice` is, an AI translation quietly falls back to the base prompt
 * without instructions, and a language whose members are all translators has
 * nobody `authorize({ project, role: 'manager' })` will let manage it.
 *
 * This module is what the index and the settings page both read, so the verdict
 * is written once and the wording is the same wherever it shows.
 */

export type LanguageHealthKey = 'members' | 'manager' | 'branch' | 'voice' | 'instructions';

export interface LanguageHealthPill {
  key: LanguageHealthKey;
  state: 'ok' | 'missing';
  /** Short enough for a table row. */
  label: string;
  /** What goes wrong, shown beside the label when something is missing. */
  detail?: string;
}

export interface LanguageHealthInput {
  isSource: boolean;
  branchName: string | null;
  audioVoice: string | null;
  translationInstructions: string | null;
  memberCount: number;
  /** Names of the members holding PROJECT_MANAGER, in display order. */
  managerNames: string[];
}

/**
 * Every language deploys in practice -- a source project is set up for all of
 * them -- so a missing branch is always a failure, never "not applicable".
 */
export function languageHealth(language: LanguageHealthInput): LanguageHealthPill[] {
  // Nothing translates into the source language: it has no team, no voice and
  // no instructions by design, so reporting four gaps would be reporting noise.
  if (language.isSource) {
    return [];
  }

  const pills: LanguageHealthPill[] = [];

  if (language.memberCount === 0) {
    pills.push({ key: 'members', state: 'missing', label: 'No members', detail: 'nobody can translate' });
  }

  pills.push(
    language.managerNames.length > 0
      ? { key: 'manager', state: 'ok', label: `Manager: ${language.managerNames[0]}` }
      : { key: 'manager', state: 'missing', label: 'No project manager', detail: 'nobody can manage this language' },
  );

  pills.push(
    language.branchName
      ? { key: 'branch', state: 'ok', label: `Branch ${language.branchName}` }
      : { key: 'branch', state: 'missing', label: 'No GitHub branch', detail: 'deploy will fail' },
  );

  pills.push(
    language.audioVoice
      ? { key: 'voice', state: 'ok', label: `Voice ${language.audioVoice}` }
      : { key: 'voice', state: 'missing', label: 'No voice', detail: 'approvals generate no audio' },
  );

  pills.push(
    language.translationInstructions?.trim()
      ? { key: 'instructions', state: 'ok', label: 'Instructions written' }
      : { key: 'instructions', state: 'missing', label: 'No AI instructions', detail: 'translations use the base prompt only' },
  );

  return pills;
}

export function countHealthProblems(pills: LanguageHealthPill[]): number {
  return pills.filter((pill) => pill.state === 'missing').length;
}
