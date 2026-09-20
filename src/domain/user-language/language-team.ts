import { ProjectRole } from '@/generated/prisma/enums';
import { userExistsById } from '@/domain/user/user.repository';
import { removeUserFromLanguage, setUserLanguageRole } from './user-language.repository';
import { parseInput } from '@/lib/validation';
import { removeLanguageMemberSchema, setLanguageMemberRoleSchema } from './user-language.types';

/**
 * The one write path to UserLanguage.
 *
 * Membership used to be writable from three screens under two sets of
 * semantics: `setLanguageMemberRoleAction` upserted a single row with an
 * explicit role, while the Users page's `adminSetUserLanguagesAction` replaced
 * a user's whole language set and re-created the survivors at TRANSLATOR --
 * so unticking and re-ticking a checkbox silently demoted a Project Manager.
 *
 * Both operations here touch exactly one (user, language) pair and never look
 * at the user's other languages. That is the property the tests pin, because
 * it is the one the old bulk write broke.
 *
 * The dependencies are injected for those tests, the way `createAuthorize`
 * does it: these rules are worth testing without a database, and a `use server`
 * module cannot be imported into a test without dragging Next's request
 * context in with it.
 */
export interface LanguageTeamDeps {
  userExists: (userId: string) => Promise<boolean>;
  setUserLanguageRole: (userId: string, languageId: string, role: ProjectRole) => Promise<unknown>;
  removeUserFromLanguage: (userId: string, languageId: string) => Promise<unknown>;
}

const defaultDeps: LanguageTeamDeps = {
  userExists: userExistsById,
  setUserLanguageRole,
  removeUserFromLanguage,
};

export function createLanguageTeam(deps: LanguageTeamDeps = defaultDeps) {
  return {
    /** Adds a member or changes their role -- the same upsert either way. */
    async setMemberRole(input: unknown) {
      const { languageId, userId, role } = parseInput(setLanguageMemberRoleSchema, input);

      if (!(await deps.userExists(userId))) {
        throw new Error('User not found');
      }

      return await deps.setUserLanguageRole(userId, languageId, role);
    },

    /**
     * Revokes access to every project in the language. What the member has in
     * flight is counted and shown by the screen before it asks; this does not
     * reassign anything, because leaving the work where it is keeps the
     * documents intact and the decision visible.
     */
    async removeMember(input: unknown) {
      const { languageId, userId } = parseInput(removeLanguageMemberSchema, input);

      return await deps.removeUserFromLanguage(userId, languageId);
    },
  };
}

export const languageTeam = createLanguageTeam();
