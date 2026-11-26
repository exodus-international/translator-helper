import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeploymentItemOutcome, DeploymentStatus, DocumentStatus, DocumentType } from '@/generated/prisma/enums';
import {
  buildCommitMessage,
  countsAsDeployed,
  finalStatus,
  findPathClashes,
  isStale,
  planItem,
  retryableOutcome,
  STALE_DEPLOYMENT_MS,
  type PlannedVersion,
} from './deployment.plan';

const approved: PlannedVersion = {
  status: DocumentStatus.APPROVED,
  content: '# Den 1',
  title: 'Day 1',
  slug: 'day-1',
  documentType: DocumentType.DAY,
  originalFilename: '1.md',
  languageCode: 'cs',
  languageName: 'Czech',
  sourceProjectName: 'Summer 2025',
  repositoryDirectory: 'summer_2025',
};

const configured = { githubConfigured: true };

describe('planItem', () => {
  it('publishes an approved version to its path in the repository', () => {
    assert.deepEqual(planItem(approved, configured), {
      kind: 'publish',
      path: 'translations/cs/exercises/summer_2025/days/1.md',
      content: '# Den 1',
    });
  });

  it('publishes a deployed version again, for a redeploy', () => {
    assert.equal(planItem({ ...approved, status: DocumentStatus.DEPLOYED }, configured).kind, 'publish');
  });

  it('skips a version that moved back out of approval after it was queued', () => {
    const plan = planItem({ ...approved, status: DocumentStatus.PENDING_REVIEW }, configured);
    assert.equal(plan.kind, 'skip');
    assert.match(plan.kind === 'skip' ? plan.reason : '', /pending review now/);
  });

  it('checks the status before anything else, so an unapproved version is never marked deployed', () => {
    const plan = planItem({ ...approved, status: DocumentStatus.IN_PROGRESS, repositoryDirectory: null }, { githubConfigured: false });
    assert.equal(plan.kind, 'skip');
  });

  it('marks a version deployed without publishing when GitHub is not set up', () => {
    const plan = planItem(approved, { githubConfigured: false });
    assert.equal(plan.kind, 'not_published');
    assert.match(plan.kind === 'not_published' ? plan.reason : '', /GitHub is not set up/);
  });

  it('names the project that has no repository directory', () => {
    const plan = planItem({ ...approved, repositoryDirectory: null }, configured);
    assert.equal(plan.kind, 'not_published');
    assert.match(plan.kind === 'not_published' ? plan.reason : '', /"Summer 2025" has no repository directory/);
  });

  it('fails a version with no document type, since its file has no known place', () => {
    const plan = planItem({ ...approved, documentType: null }, configured);
    assert.equal(plan.kind, 'failed');
    assert.match(plan.kind === 'failed' ? plan.error : '', /no document type/);
  });
});

describe('findPathClashes', () => {
  it('fails the later of two items that write one file, and only that one', () => {
    const clashes = findPathClashes([
      { itemId: 'a', path: 'x.md' },
      { itemId: 'b', path: 'y.md' },
      { itemId: 'c', path: 'x.md' },
    ]);
    assert.deepEqual([...clashes.keys()], ['c']);
    assert.match(clashes.get('c') ?? '', /same file, x\.md/);
  });

  it('finds nothing when every path is different', () => {
    assert.equal(findPathClashes([{ itemId: 'a', path: 'x.md' }]).size, 0);
  });
});

describe('buildCommitMessage', () => {
  it('reads as one sentence for one document, and names who deployed it', () => {
    assert.equal(
      buildCommitMessage({ documents: [{ title: 'Day 1', languageName: 'Czech' }], requesterName: 'Ana' }),
      'Deploy Czech: Day 1\n\nDeployed by Ana from Translator Helper.',
    );
  });

  it('lists a batch with its languages, and caps the list', () => {
    const documents = Array.from({ length: 12 }, (_, index) => ({
      title: `Day ${index + 1}`,
      languageName: index % 2 ? 'Slovak' : 'Czech',
    }));
    const message = buildCommitMessage({ documents, requesterName: null });
    const lines = message.split('\n');
    assert.equal(lines[0], 'Deploy 12 documents (Czech, Slovak)');
    assert.equal(lines.filter((line) => line.startsWith('- Day')).length, 10);
    assert.ok(lines.includes('- and 2 more'));
    assert.equal(lines.at(-1), 'Deployed from Translator Helper.');
  });
});

describe('how a deployment ends', () => {
  it('succeeds when nothing failed, skipped documents included', () => {
    assert.equal(
      finalStatus([DeploymentItemOutcome.PUBLISHED, DeploymentItemOutcome.UNCHANGED, DeploymentItemOutcome.SKIPPED]),
      DeploymentStatus.SUCCEEDED,
    );
  });

  it('fails when any document failed or never ran', () => {
    assert.equal(finalStatus([DeploymentItemOutcome.PUBLISHED, DeploymentItemOutcome.FAILED]), DeploymentStatus.FAILED);
    assert.equal(finalStatus([DeploymentItemOutcome.PENDING]), DeploymentStatus.FAILED);
  });

  it('retries only what did not go out', () => {
    const retried = Object.values(DeploymentItemOutcome).filter(retryableOutcome);
    assert.deepEqual(retried.sort(), [DeploymentItemOutcome.FAILED, DeploymentItemOutcome.PENDING].sort());
  });

  it('counts a document as deployed when it was published, already up to date, or kept out of GitHub on purpose', () => {
    const deployed = Object.values(DeploymentItemOutcome).filter(countsAsDeployed);
    assert.deepEqual(
      deployed.sort(),
      [DeploymentItemOutcome.PUBLISHED, DeploymentItemOutcome.UNCHANGED, DeploymentItemOutcome.NOT_PUBLISHED].sort(),
    );
  });
});

describe('isStale', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('treats a deploy still running past the limit as stopped', () => {
    assert.equal(isStale({ status: DeploymentStatus.PUBLISHING, createdAt: ago(STALE_DEPLOYMENT_MS + 1) }, now), true);
  });

  it('leaves a recent deploy, and a finished one, alone', () => {
    assert.equal(isStale({ status: DeploymentStatus.QUEUED, createdAt: ago(1000) }, now), false);
    assert.equal(isStale({ status: DeploymentStatus.FAILED, createdAt: ago(STALE_DEPLOYMENT_MS * 2) }, now), false);
  });
});
