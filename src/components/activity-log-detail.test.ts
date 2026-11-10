import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDetailText } from './activity-log-detail';

describe('getDetailText for a GitHub deploy', () => {
  it('says a merged deploy reached main', () => {
    assert.equal(getDetailText('github_deployed', { merged: true }), 'merged into main');
  });

  it('gives the reason a deploy left its pull request open', () => {
    assert.equal(
      getDetailText('github_deployed', { merged: false, mergeError: 'At least 1 approving review is required' }),
      'PR left open: At least 1 approving review is required',
    );
  });

  it('cuts a long reason to one line', () => {
    const detail = getDetailText('github_deployed', { merged: false, mergeError: 'x'.repeat(100) });
    assert.equal(detail, `PR left open: ${'x'.repeat(60)}...`);
  });

  it('shows nothing for a deploy that leaves its pull request open by design', () => {
    assert.equal(getDetailText('github_deployed', {}), null);
  });

  it('still shows why a deploy failed', () => {
    assert.equal(getDetailText('github_deploy_failed', { error: 'branch missing' }), 'branch missing');
  });
});
