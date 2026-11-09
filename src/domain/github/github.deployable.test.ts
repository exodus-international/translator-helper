import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { assertDeployableStatus, isDeployableStatus } from './github.deployable';

describe('which versions may be deployed to GitHub', () => {
  it('allows approved work and a retry of deployed work', () => {
    assert.equal(isDeployableStatus(DocumentStatus.APPROVED), true);
    assert.equal(isDeployableStatus(DocumentStatus.DEPLOYED), true);
    assert.doesNotThrow(() => assertDeployableStatus(DocumentStatus.APPROVED));
    assert.doesNotThrow(() => assertDeployableStatus(DocumentStatus.DEPLOYED));
  });

  it('refuses anything that has not passed review', () => {
    for (const status of [
      DocumentStatus.PENDING_TRANSLATION,
      DocumentStatus.IN_PROGRESS,
      DocumentStatus.PENDING_REVIEW,
    ]) {
      assert.equal(isDeployableStatus(status), false);
      assert.throws(() => assertDeployableStatus(status), /Only approved translations can be deployed/);
    }
  });
});
