import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@/generated/prisma/enums';
import { ensureValidRole } from './valid-role';

describe('ensureValidRole', () => {
  it('turns a role the enum does not know into USER', () => {
    const args = { data: { role: 'SUPERADMIN' } };
    ensureValidRole(args);
    assert.equal(args.data.role, Role.USER);
  });

  it('keeps every role the enum knows', () => {
    for (const role of Object.values(Role)) {
      const args = { data: { role } };
      ensureValidRole(args);
      assert.equal(args.data.role, role);
    }
  });

  it('leaves a write that does not touch the role alone', () => {
    const args = { data: { name: 'Ada' } as { name: string; role?: unknown } };
    ensureValidRole(args);
    assert.equal('role' in args.data, false);
  });

  it('copes with a write that carries no data at all', () => {
    assert.doesNotThrow(() => ensureValidRole({}));
  });
});
