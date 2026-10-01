import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRole } from '@/generated/prisma/enums';
import { createLanguageTeam, type LanguageTeamDeps } from './language-team';

const CROATIAN = '11111111-1111-4111-8111-111111111111';
const SLOVAK = '22222222-2222-4222-8222-222222222222';

type Call = { fn: string; args: unknown[] };

function stub(overrides: Partial<LanguageTeamDeps> = {}) {
  const calls: Call[] = [];
  const team = createLanguageTeam({
    userExists: async () => true,
    setUserLanguageRole: async (...args) => {
      calls.push({ fn: 'setUserLanguageRole', args });
      return { ok: true };
    },
    removeUserFromLanguage: async (...args) => {
      calls.push({ fn: 'removeUserFromLanguage', args });
      return { count: 1 };
    },
    ...overrides,
  });

  return { team, calls };
}

describe('languageTeam.setMemberRole', () => {
  it('upserts exactly one row, for the language it was given', async () => {
    const { team, calls } = stub();

    await team.setMemberRole({ languageId: CROATIAN, userId: 'user-1', role: ProjectRole.REVIEWER });

    assert.deepEqual(calls, [
      { fn: 'setUserLanguageRole', args: ['user-1', CROATIAN, ProjectRole.REVIEWER] },
    ]);
  });

  it('never touches the user other languages', async () => {
    // The regression the Users page's bulk write would otherwise reintroduce:
    // it replaced the whole set, so editing one language rewrote the rest.
    const { team, calls } = stub();

    await team.setMemberRole({ languageId: SLOVAK, userId: 'user-1', role: ProjectRole.TRANSLATOR });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[1], SLOVAK);
  });

  it('keeps the role it is given rather than defaulting to translator', async () => {
    // Re-adding a Project Manager through the old dialog silently demoted them.
    const { team, calls } = stub();

    await team.setMemberRole({ languageId: CROATIAN, userId: 'user-1', role: ProjectRole.PROJECT_MANAGER });

    assert.equal(calls[0].args[2], ProjectRole.PROJECT_MANAGER);
  });

  it('refuses a user that does not exist, before writing anything', async () => {
    const { team, calls } = stub({ userExists: async () => false });

    await assert.rejects(
      team.setMemberRole({ languageId: CROATIAN, userId: 'ghost', role: ProjectRole.EDITOR }),
      { message: 'User not found' },
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a call keyed by anything but a language id', async () => {
    const { team, calls } = stub();

    await assert.rejects(team.setMemberRole({ translationProjectId: CROATIAN, userId: 'user-1', role: 'REVIEWER' }));
    await assert.rejects(team.setMemberRole({ languageId: 'not-a-uuid', userId: 'user-1', role: 'REVIEWER' }));
    await assert.rejects(team.setMemberRole({ languageId: CROATIAN, userId: 'user-1', role: 'ARCHBISHOP' }));
    assert.deepEqual(calls, []);
  });
});

describe('languageTeam.removeMember', () => {
  it('deletes exactly one membership', async () => {
    const { team, calls } = stub();

    await team.removeMember({ languageId: CROATIAN, userId: 'user-1' });

    assert.deepEqual(calls, [{ fn: 'removeUserFromLanguage', args: ['user-1', CROATIAN] }]);
  });

  it('leaves the member work where it is', async () => {
    // Removal revokes access; it does not reassign or delete anything. The
    // count of what they have in flight is shown before the confirmation.
    const { team, calls } = stub();

    await team.removeMember({ languageId: CROATIAN, userId: 'user-1' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, 'removeUserFromLanguage');
  });

  it('rejects a removal that names no language', async () => {
    const { team, calls } = stub();

    await assert.rejects(team.removeMember({ userId: 'user-1' }));
    assert.deepEqual(calls, []);
  });
});
