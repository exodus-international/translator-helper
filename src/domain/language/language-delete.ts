/**
 * `prisma.language.delete` cascades into DocumentVersion, TranslationProject,
 * UserLanguage and InvitationLanguage. One trash icon behind one generic
 * confirm could therefore wipe every translation ever written in a language,
 * with no undo and no backup path in this app.
 *
 * The rule is a decision, not a dialog, so it lives here and is tested without
 * a database: a language holding translations is refused outright, and an empty
 * one still has to have its name typed back.
 */

export interface LanguageDependents {
  versions: number;
  translationProjects: number;
  memberships: number;
  invitations: number;
}

export type LanguageDeletionPlan =
  | { allowed: false; reason: string }
  | { allowed: true; summary: string; confirmationPhrase: string };

export function planLanguageDeletion(
  language: { name: string; isSource: boolean },
  dependents: LanguageDependents,
): LanguageDeletionPlan {
  if (language.isSource) {
    return {
      allowed: false,
      reason: `${language.name} is the source language. Documents are written in it, so it cannot be deleted.`,
    };
  }

  if (dependents.versions > 0) {
    return {
      allowed: false,
      reason: `${language.name} has ${dependents.versions} ${plural(dependents.versions, 'translation')}. Deleting the language would destroy every one of them, so it is blocked while any exist.`,
    };
  }

  return {
    allowed: true,
    summary: `${language.name} has no translations. Deleting it also removes ${list([
      [dependents.translationProjects, 'translation project'],
      [dependents.memberships, 'membership'],
      [dependents.invitations, 'pending invitation'],
    ])}. This cannot be undone.`,
    confirmationPhrase: language.name,
  };
}

/** Throws with the reason a human should read, or returns nothing. */
export function assertLanguageDeletable(
  language: { name: string; isSource: boolean },
  dependents: LanguageDependents,
  confirmation: string,
): void {
  const plan = planLanguageDeletion(language, dependents);

  if (!plan.allowed) {
    throw new Error(plan.reason);
  }

  if (confirmation.trim() !== plan.confirmationPhrase) {
    throw new Error(`Type "${plan.confirmationPhrase}" to confirm the deletion.`);
  }
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function list(parts: [count: number, word: string][]): string {
  const phrases = parts.map(([count, word]) => `${count} ${plural(count, word)}`);
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}
