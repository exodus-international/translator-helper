/**
 * The permission each server action asks for, as a table.
 *
 * Every exported function in a `*.actions.ts` file is reachable over HTTP by
 * anyone who can reach the app, so what it asks `authorize()` for is the whole
 * of its access control. This test reads the source of every action and checks
 * the `authorize()` calls in each one against the table below, in order.
 *
 * A new action fails until it has a row here, and a row is a decision: an
 * action that widens its permission changes this file in the same diff, where
 * a reviewer sees it. The two entries with an empty list are the public
 * pre-authentication actions behind an invitation, and they are public on
 * purpose.
 *
 * The table records what an action asks for, not whether the answer is right
 * for the data it then touches; that is what the database-backed tests are for.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Permissions as `authorize()` is called with them, flattened to one string
 * each: `'admin'` stays `admin`, `{ project, role: 'manager' }` becomes
 * `project:manager`, and `{ project, roles: ['reviewer', 'translator'] }`
 * becomes `project:reviewer|translator`.
 */
const EXPECTED: Record<string, Record<string, string[]>> = {
  'announcement/announcement.actions.ts': {
    getVisibleAnnouncementsAction: ['authenticated'],
    dismissAnnouncementAction: ['authenticated'],
    createAnnouncementAction: ['admin'],
    updateAnnouncementAction: ['admin'],
    deleteAnnouncementAction: ['admin'],
    toggleAnnouncementActiveAction: ['admin'],
  },
  'audio/audio.actions.ts': {
    getLatestAudioFileAction: ['authenticated'],
    advanceAudioJobAction: ['authenticated'],
    getAudioReadinessAction: ['authenticated'],
    regenerateAudioAction: ['authenticated'],
    getAudioTranscriptAction: ['authenticated'],
    getAudioTranscriptStateAction: ['authenticated'],
    saveAudioTranscriptAction: ['authenticated'],
    keepAudioTranscriptAction: ['authenticated'],
    resetAudioTranscriptAction: ['authenticated'],
  },
  'document-version/document-version.actions.ts': {
    assignReviewerToVersionAction: ['admin'],
    assignTranslatorToVersionAction: ['project:manager'],
    getWorkVersionsForUserAction: ['authenticated'],
    listVersionsForTranslationProjectAction: ['project:member'],
    updateDocumentVersionAction: ['authenticated'],
    // Member of the project when there is one, administrator otherwise.
    submitForReviewAction: ['authenticated', 'project:member', 'admin'],
    deleteDocumentVersionAction: ['authenticated'],
    // The language's manager only when the move enters or leaves DEPLOYED.
    updateDocumentVersionStatusAction: ['authenticated', 'language:manager'],
    assignDocumentVersionAction: ['authenticated', 'project:translator'],
    getApprovedVersionsAction: ['authenticated'],
  },
  'document/document.actions.ts': {
    listDocumentsAction: ['authenticated'],
    createDocumentAction: ['admin'],
    updateDocumentAction: ['admin'],
    deleteDocumentAction: ['admin'],
    deleteDocumentActionVoid: ['admin'],
    listDocumentsOverviewAction: ['admin'],
    getDashboardDocumentsAction: ['authenticated'],
    // Open to every signed-in person on purpose: reviewers relabel documents
    // they do not otherwise edit.
    toggleDocumentLabelAction: ['authenticated'],
  },
  'github/github.actions.ts': {
    deployToGitHubAction: ['language:manager'],
    getGitHubCommitsForVersionAction: ['authenticated'],
  },
  'invitation/invitation.actions.ts': {
    createInvitationAction: ['admin'],
    listInvitationsAction: ['admin'],
    revokeInvitationAction: ['admin'],
    // Public: the person is not signed in yet, the token is the credential.
    validateInvitationTokenAction: [],
    registerWithInviteAction: [],
  },
  'language/language.actions.ts': {
    createLanguageAction: ['can:manage-languages'],
    updateLanguageSettingsAction: ['can:manage-languages'],
    updateLanguageInstructionsAction: ['language:manager'],
    deleteLanguageAction: ['can:manage-languages'],
  },
  'notification/notification.actions.ts': {
    getInboxAction: ['authenticated'],
    getNotificationPageAction: ['authenticated'],
    getUnreadCountAction: ['authenticated'],
    markNotificationsReadAction: ['authenticated'],
    getEmailPreferencesAction: ['authenticated'],
    setEmailPreferenceAction: ['authenticated'],
    countWaitingEmailRecipientsAction: ['admin'],
    sendWaitingEmailsNowAction: ['admin'],
  },
  'source-project/source-project.actions.ts': {
    listSourceProjectsAction: ['authenticated'],
    listSourceProjectsPaginatedAction: ['authenticated'],
    getSourceProjectsForUserAction: ['authenticated'],
    getSourceProjectAction: ['authenticated'],
    getSourceProjectBySlugAction: ['authenticated'],
    createSourceProjectAction: ['can:manage-folders'],
    // Administrators, or a manager of the project through canManageSourceProject.
    updateSourceProjectAction: ['authenticated'],
    deleteSourceProjectAction: ['can:manage-folders'],
  },
  'suggestion/suggestion.actions.ts': {
    getSuggestionsByDocumentVersionAction: ['authenticated'],
    createSuggestionAction: ['authenticated', 'project:reviewer', 'admin'],
    applySuggestionAction: ['authenticated', 'project:translator', 'admin'],
    dismissSuggestionAction: ['authenticated', 'project:translator', 'admin'],
    reopenSuggestionAction: ['authenticated', 'project:reviewer|translator', 'admin'],
    // The author only, checked against the row.
    editSuggestionAction: ['authenticated'],
    createSuggestionReplyAction: ['authenticated'],
  },
  'translation-project/translation-project.actions.ts': {
    listTranslationProjectsAction: ['authenticated'],
    listTranslationProjectsPaginatedAction: ['authenticated'],
    getTranslationProjectAction: ['authenticated'],
    createTranslationProjectAction: ['can:manage-folders'],
  },
  'translation/translation.actions.ts': {
    translateDocumentAction: ['authenticated'],
  },
  'user-language/user-language.actions.ts': {
    listTranslationProjectMembersAction: ['authenticated'],
    getProjectReviewersAction: ['authenticated'],
    setLanguageMemberRoleAction: ['language:manager'],
    removeLanguageMemberAction: ['language:manager'],
  },
  'user/user.actions.ts': {
    updateUserRoleAction: ['admin'],
    listUsersAction: ['admin'],
    getUserProfileAction: ['authenticated'],
    updateUserProfileAction: ['authenticated'],
    completeOnboardingAction: ['authenticated'],
    isUserOnboardedAction: ['authenticated'],
    adminUpdateUserProfileAction: ['admin'],
    uploadAvatarAction: ['authenticated'],
    removeAvatarAction: ['authenticated'],
  },
};

const DOMAIN_DIR = path.resolve(__dirname);

function listActionFiles(): string[] {
  const files: string[] = [];
  for (const domain of fs.readdirSync(DOMAIN_DIR, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(DOMAIN_DIR, domain.name))) {
      if (name.endsWith('.actions.ts')) files.push(`${domain.name}/${name}`);
    }
  }
  return files.sort();
}

/** `'admin'` for a string literal, `project:manager` for a scoped object. */
function permissionOf(argument: ts.Expression): string {
  if (ts.isStringLiteral(argument)) return argument.text;
  if (ts.isObjectLiteralExpression(argument)) {
    let scope = '';
    let role = '';
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
      const key = property.name.getText();
      if (key === 'project' || key === 'language') scope = key;
      if (key === 'role' && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
        role = property.initializer.text;
      }
      if (key === 'roles' && ts.isPropertyAssignment(property) && ts.isArrayLiteralExpression(property.initializer)) {
        role = property.initializer.elements.map((element) => (ts.isStringLiteral(element) ? element.text : '?')).join('|');
      }
    }
    return `${scope}:${role}`;
  }
  return `<${argument.getText()}>`;
}

/** Every exported function in the file, with its `authorize()` calls in source order. */
function readActions(file: string): Record<string, string[]> {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(DOMAIN_DIR, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const actions: Record<string, string[]> = {};
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    const permissions: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText() === 'authorize' && node.arguments[0]) {
        permissions.push(permissionOf(node.arguments[0]));
      }
      ts.forEachChild(node, visit);
    };
    visit(statement.body);
    actions[statement.name.text] = permissions;
  }
  return actions;
}

describe('server action permissions', () => {
  const files = listActionFiles();

  it('has a row in the table for every action file', () => {
    assert.deepEqual(files, Object.keys(EXPECTED).sort());
  });

  for (const file of files) {
    describe(file, () => {
      const actual = readActions(file);
      const expected = EXPECTED[file] ?? {};

      it('lists every exported action, and only those', () => {
        assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
      });

      for (const [action, permissions] of Object.entries(expected)) {
        it(`${action} asks for ${permissions.length ? permissions.join(', then ') : 'nothing: it is public'}`, () => {
          assert.deepEqual(actual[action], permissions);
        });
      }
    });
  }
});
