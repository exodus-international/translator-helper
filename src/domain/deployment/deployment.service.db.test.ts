/**
 * Running deployments against the seeded database and a GitHub held in
 * memory: what each document ends up as, what the deployment records, and
 * what a second deploy, a failure, a retry and a crashed process do.
 *
 * Every test makes its own documents in Exodus90 (which publishes to
 * `exodus90`) and Summer Retreat (which has no repository directory), so no
 * seeded version moves.
 */
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeploymentItemOutcome,
  DeploymentStatus,
  DeploymentTrigger,
  DocumentStatus,
  DocumentType,
} from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import type { PublishFile } from '../github/github.publish';
import { SEEDED_USERS, seededLanguage, seededSourceProject, seededUser } from '../../../tests/seeded';
import { createDeployments, toDeploymentView, type DeploymentDeps } from './deployment.service';
import * as repository from './deployment.repository';
import { INTERRUPTED_MESSAGE, STALE_DEPLOYMENT_MS } from './deployment.plan';

after(() => prisma.$disconnect());

const createdDocuments: string[] = [];
const createdDeployments = new Set<string>();

afterEach(async () => {
  await prisma.deployment.deleteMany({ where: { id: { in: [...createdDeployments] } } });
  await prisma.document.deleteMany({ where: { id: { in: createdDocuments } } });
  createdDeployments.clear();
  createdDocuments.length = 0;
});

let counter = 0;

/** A document with one version, in Czech unless told otherwise, in a project that publishes or one that does not. */
async function makeVersion(
  options: { status?: DocumentStatus; project?: 'exodus90' | 'summer2025'; content?: string; language?: string } = {},
) {
  counter += 1;
  const project = await seededSourceProject(options.project ?? 'exodus90');
  const language = await seededLanguage(options.language ?? 'cs');
  const slug = `deploy-test-${Date.now()}-${counter}`;
  const document = await prisma.document.create({
    data: {
      slug,
      title: `Deploy test ${counter}`,
      type: DocumentType.DAY,
      originalFilename: `${slug}.md`,
      sourceProjectId: project.id,
    },
  });
  createdDocuments.push(document.id);
  const version = await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      languageId: language.id,
      content: options.content ?? `# ${slug}`,
      status: options.status ?? DocumentStatus.APPROVED,
    },
  });
  return { version, path: `translations/${language.code}/exercises/${project.repositoryDirectory}/days/${slug}.md` };
}

/** A repository in memory, and a deployments service wired to it with fakes that record every call. */
function harness(
  options: {
    githubConfigured?: boolean;
    /** Runs while the commit is being made, as an edit in another tab would. */
    duringPublish?: () => Promise<void>;
    /** The activity log cannot be written. */
    logFails?: boolean;
  } = {},
) {
  const files = new Map<string, string>();
  const logs: { action: string; documentVersionId: string; details: Record<string, unknown> }[] = [];
  const notified: { versionId: string; to: DocumentStatus }[] = [];
  let commits = 0;
  let failNext: string | null = null;

  const deps: DeploymentDeps = {
    githubConfigured: () => options.githubConfigured ?? true,
    deployBranch: () => 'main',
    publish: async (toPublish: PublishFile[]) => {
      await options.duringPublish?.();
      if (failNext) {
        const message = failNext;
        failNext = null;
        throw new Error(message);
      }
      const changed = toPublish.filter((file) => files.get(file.path) !== file.content);
      if (changed.length === 0) return { commit: null, changedPaths: [] };
      for (const file of changed) files.set(file.path, file.content);
      commits += 1;
      return { commit: { sha: `sha${commits}`.padEnd(40, '0'), url: `https://github.test/commit/${commits}` }, changedPaths: changed.map((file) => file.path) };
    },
    log: async (entry) => {
      if (options.logFails) throw new Error('activity log is down');
      logs.push({ action: entry.action, documentVersionId: entry.documentVersionId, details: entry.details });
    },
    notify: async (input) => {
      notified.push({ versionId: input.versionId, to: input.to });
    },
  };

  const service = createDeployments(deps);
  return {
    files,
    logs,
    notified,
    commits: () => commits,
    failNextPublish: (message: string) => {
      failNext = message;
    },
    /** Queues and runs one deployment, as the action and `after()` would. */
    async deploy(versionIds: string[], trigger: DeploymentTrigger = DeploymentTrigger.MANUAL, retryOfId?: string) {
      const requester = await seededUser(SEEDED_USERS.translator);
      const started = await service.queueDeployment({ versionIds, trigger, requestedById: requester.id, retryOfId });
      if (started.deploymentId) createdDeployments.add(started.deploymentId);
      if (started.deploymentId && !started.joined) await service.runDeployment(started.deploymentId);
      return { started, deployment: started.deploymentId ? await repository.getDeployment(started.deploymentId) : null };
    },
    service,
  };
}

const statusOf = async (id: string) => (await prisma.documentVersion.findUniqueOrThrow({ where: { id } })).status;
const outcomeOf = (deployment: Awaited<ReturnType<typeof repository.getDeployment>>, versionId: string) =>
  deployment?.items.find((item) => item.documentVersion.id === versionId)?.outcome;

describe('deploying approved documents', () => {
  it('publishes them in one commit, marks them deployed, and records who, what and where', async () => {
    const one = await makeVersion();
    const two = await makeVersion();
    const github = harness();

    const { deployment } = await github.deploy([one.version.id, two.version.id]);

    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(deployment?.branch, 'main');
    assert.match(deployment?.commitSha ?? '', /^sha1/);
    assert.equal(deployment?.requestedBy?.name !== undefined, true);
    assert.ok(deployment?.finishedAt);
    assert.equal(github.commits(), 1);
    assert.equal(github.files.get(one.path), one.version.content);
    assert.equal(await statusOf(one.version.id), DocumentStatus.DEPLOYED);
    assert.equal(await statusOf(two.version.id), DocumentStatus.DEPLOYED);
    assert.equal(outcomeOf(deployment, one.version.id), DeploymentItemOutcome.PUBLISHED);
    assert.deepEqual(
      github.logs.filter((log) => log.documentVersionId === one.version.id).map((log) => log.action),
      ['status_updated', 'github_deployed'],
    );
    assert.deepEqual(github.notified.map((n) => n.to), [DocumentStatus.DEPLOYED, DocumentStatus.DEPLOYED]);
  });

  it('commits nothing the second time, and says the document was already up to date', async () => {
    const { version } = await makeVersion();
    const github = harness();
    await github.deploy([version.id]);

    const { deployment } = await github.deploy([version.id], DeploymentTrigger.REDEPLOY);

    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(deployment?.trigger, DeploymentTrigger.REDEPLOY);
    assert.equal(deployment?.commitSha, null);
    assert.equal(github.commits(), 1);
    assert.equal(outcomeOf(deployment, version.id), DeploymentItemOutcome.UNCHANGED);
    // Already DEPLOYED: no second status line and no second notification.
    assert.equal(github.notified.length, 1);
    assert.deepEqual(github.logs.at(-1)?.details, { deploymentId: deployment?.id, unchanged: true });
  });

  it('marks a document in a project with no repository directory deployed without publishing it', async () => {
    const { version } = await makeVersion({ project: 'summer2025' });
    const github = harness();

    const { deployment } = await github.deploy([version.id]);

    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(outcomeOf(deployment, version.id), DeploymentItemOutcome.NOT_PUBLISHED);
    assert.equal(github.commits(), 0);
    assert.equal(await statusOf(version.id), DocumentStatus.DEPLOYED);
  });

  it('skips a document that left approval after it was queued, and leaves its status alone', async () => {
    const { version } = await makeVersion();
    const github = harness();
    const requester = await seededUser(SEEDED_USERS.translator);
    const started = await github.service.queueDeployment({
      versionIds: [version.id],
      trigger: DeploymentTrigger.MANUAL,
      requestedById: requester.id,
    });
    createdDeployments.add(started.deploymentId!);
    await prisma.documentVersion.update({ where: { id: version.id }, data: { status: DocumentStatus.IN_PROGRESS } });

    await github.service.runDeployment(started.deploymentId!);
    const deployment = await repository.getDeployment(started.deploymentId!);

    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(outcomeOf(deployment, version.id), DeploymentItemOutcome.SKIPPED);
    assert.equal(await statusOf(version.id), DocumentStatus.IN_PROGRESS);
    assert.equal(github.commits(), 0);
  });
});

describe('what a deploy saves', () => {
  it('leaves a version approved when its text was edited while the deploy ran', async () => {
    const { version, path } = await makeVersion({ content: '# First text' });
    const github = harness({
      duringPublish: () =>
        prisma.documentVersion.update({ where: { id: version.id }, data: { content: '# Edited text' } }).then(() => {}),
    });

    const { deployment } = await github.deploy([version.id]);

    // The first text went out, so the version is not what is on the branch: it stays approved for the next deploy.
    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(outcomeOf(deployment, version.id), DeploymentItemOutcome.PUBLISHED);
    assert.equal(github.files.get(path), '# First text');
    assert.equal(await statusOf(version.id), DocumentStatus.APPROVED);
    assert.equal(github.notified.length, 0);
    // The page reads that status from the history, not the outcome.
    assert.equal(toDeploymentView(deployment!).items[0].versionDeployed, false);
  });

  it('keeps the commit and the deployed status when the activity log cannot be written', async () => {
    const { version } = await makeVersion();
    const github = harness({ logFails: true });

    const { deployment } = await github.deploy([version.id]);

    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.match(deployment?.commitSha ?? '', /^sha1/);
    assert.ok(deployment?.commitUrl);
    assert.equal(outcomeOf(deployment, version.id), DeploymentItemOutcome.PUBLISHED);
    assert.equal(await statusOf(version.id), DocumentStatus.DEPLOYED);
  });
});

describe('a deploy that fails, and its retry', () => {
  it('keeps the documents approved and records GitHub’s error, then a retry sends only those again', async () => {
    const one = await makeVersion();
    const elsewhere = await makeVersion({ project: 'summer2025' });
    const github = harness();
    github.failNextPublish('Resource not accessible by integration');

    const { deployment: failed } = await github.deploy([one.version.id, elsewhere.version.id]);

    assert.equal(failed?.status, DeploymentStatus.FAILED);
    assert.equal(failed?.error, 'Resource not accessible by integration');
    assert.equal(outcomeOf(failed, one.version.id), DeploymentItemOutcome.FAILED);
    assert.equal(outcomeOf(failed, elsewhere.version.id), DeploymentItemOutcome.NOT_PUBLISHED);
    assert.equal(await statusOf(one.version.id), DocumentStatus.APPROVED);
    assert.equal(await statusOf(elsewhere.version.id), DocumentStatus.DEPLOYED);
    assert.ok(github.logs.some((log) => log.action === 'github_deploy_failed' && log.documentVersionId === one.version.id));

    const retryable = await repository.getRetryableItems(failed!.id);
    assert.deepEqual(retryable.map((item) => item.documentVersionId), [one.version.id]);

    const { deployment: retry } = await github.deploy([one.version.id], DeploymentTrigger.RETRY, failed!.id);
    assert.equal(retry?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(retry?.retryOfId, failed!.id);
    assert.equal(retry?.items.length, 1);
    assert.equal(await statusOf(one.version.id), DocumentStatus.DEPLOYED);
  });
});

describe('deploys that overlap', () => {
  it('joins the deploy already running for the same documents instead of starting another', async () => {
    const { version } = await makeVersion();
    const github = harness();
    const requester = await seededUser(SEEDED_USERS.translator);
    const first = await github.service.queueDeployment({ versionIds: [version.id], trigger: DeploymentTrigger.MANUAL, requestedById: requester.id });
    createdDeployments.add(first.deploymentId!);

    const second = await github.service.queueDeployment({ versionIds: [version.id], trigger: DeploymentTrigger.MANUAL, requestedById: requester.id });

    assert.deepEqual(second, { deploymentId: first.deploymentId, joined: true });
    assert.equal(await prisma.deployment.count({ where: { items: { some: { documentVersionId: version.id } } } }), 1);
  });

  it('leaves the documents already running to their deploy and queues only the rest', async () => {
    const running = await makeVersion();
    const fresh = await makeVersion();
    const github = harness();
    const requester = await seededUser(SEEDED_USERS.translator);
    const first = await github.service.queueDeployment({ versionIds: [running.version.id], trigger: DeploymentTrigger.MANUAL, requestedById: requester.id });
    createdDeployments.add(first.deploymentId!);

    const second = await github.service.queueDeployment({
      versionIds: [running.version.id, fresh.version.id],
      trigger: DeploymentTrigger.MANUAL,
      requestedById: requester.id,
    });
    createdDeployments.add(second.deploymentId!);

    assert.equal(second.joined, false);
    const record = await repository.getDeployment(second.deploymentId!);
    assert.deepEqual(record?.items.map((item) => item.documentVersion.id), [fresh.version.id]);
  });

  it('publishes a deployment once, however many times it is started', async () => {
    const { version } = await makeVersion();
    const github = harness();
    const requester = await seededUser(SEEDED_USERS.translator);
    const started = await github.service.queueDeployment({ versionIds: [version.id], trigger: DeploymentTrigger.MANUAL, requestedById: requester.id });
    createdDeployments.add(started.deploymentId!);

    await Promise.all([github.service.runDeployment(started.deploymentId!), github.service.runDeployment(started.deploymentId!)]);

    assert.equal(github.commits(), 1);
    assert.equal(github.notified.length, 1);
  });

  it('fails a deploy whose process died, so its documents can be deployed again', async () => {
    const { version } = await makeVersion();
    const github = harness();
    const requester = await seededUser(SEEDED_USERS.translator);
    const stuck = await github.service.queueDeployment({ versionIds: [version.id], trigger: DeploymentTrigger.MANUAL, requestedById: requester.id });
    createdDeployments.add(stuck.deploymentId!);
    await prisma.deployment.update({
      where: { id: stuck.deploymentId! },
      data: { status: DeploymentStatus.PUBLISHING, createdAt: new Date(Date.now() - STALE_DEPLOYMENT_MS - 1000) },
    });

    assert.ok((await repository.failStaleDeployments()) >= 1);
    const swept = await repository.getDeployment(stuck.deploymentId!);
    assert.equal(swept?.status, DeploymentStatus.FAILED);
    assert.equal(swept?.error, INTERRUPTED_MESSAGE);

    const { started } = await github.deploy([version.id]);
    assert.equal(started.joined, false);
    assert.notEqual(started.deploymentId, stuck.deploymentId);
  });
});

describe('deploy history', () => {
  it('lists one document’s deploys newest first, and hides other languages from a team member', async () => {
    const { version } = await makeVersion();
    const github = harness();
    const { deployment: first } = await github.deploy([version.id]);
    const { deployment: second } = await github.deploy([version.id], DeploymentTrigger.REDEPLOY);

    const history = await repository.listDeployments({ documentVersionId: version.id });
    assert.deepEqual(history.map((record) => record.id), [second!.id, first!.id]);
    assert.equal('email' in (history[0].requestedBy ?? {}), false);

    const slovak = await seededLanguage('sk');
    assert.deepEqual(await repository.listDeployments({ documentVersionId: version.id, languageIds: [slovak.id] }), []);
  });
});

describe('a deploy seen from one language', () => {
  it('shows a team member only their language’s documents, counts and errors', async () => {
    const czech = await makeVersion();
    const slovak = await makeVersion({ language: 'sk' });
    const github = harness();
    github.failNextPublish('Resource not accessible by integration');
    const { deployment } = await github.deploy([czech.version.id, slovak.version.id]);
    const record = deployment!;

    const full = toDeploymentView(record);
    assert.equal(full.items.length, 2);

    const czechLanguage = await seededLanguage('cs');
    const mine = toDeploymentView(record, new Set([czechLanguage.id]));
    assert.deepEqual(mine.items.map((item) => item.documentVersionId), [czech.version.id]);
    assert.equal(mine.counts.FAILED, 1);
    assert.equal(mine.items[0].title.startsWith('Deploy test'), true);

    const slovakLanguage = await seededLanguage('sk');
    const theirs = toDeploymentView(record, new Set([slovakLanguage.id]));
    assert.deepEqual(theirs.items.map((item) => item.documentVersionId), [slovak.version.id]);
  });

  it('does not repeat another language’s error to a team member who cannot see that document', async () => {
    const czech = await makeVersion();
    const slovak = await makeVersion({ language: 'sk' });
    const github = harness();
    const requester = await seededUser(SEEDED_USERS.translator);
    const started = await github.service.queueDeployment({
      versionIds: [czech.version.id, slovak.version.id],
      trigger: DeploymentTrigger.MANUAL,
      requestedById: requester.id,
    });
    createdDeployments.add(started.deploymentId!);
    // The Slovak one leaves approval after it was queued, and is skipped with a reason of its own.
    await prisma.documentVersion.update({ where: { id: slovak.version.id }, data: { status: DocumentStatus.IN_PROGRESS } });
    await github.service.runDeployment(started.deploymentId!);
    const record = (await repository.getDeployment(started.deploymentId!))!;
    const failed = record.items.find((item) => item.documentVersion.id === slovak.version.id)!;
    await prisma.deployment.update({ where: { id: record.id }, data: { status: DeploymentStatus.FAILED, error: failed.error } });

    const czechLanguage = await seededLanguage('cs');
    const mine = toDeploymentView((await repository.getDeployment(record.id))!, new Set([czechLanguage.id]));

    assert.ok(failed.error);
    assert.notEqual(mine.error, failed.error);
    assert.equal(mine.error, 'A document in another language could not be deployed.');
  });

  it('shows no error for a deploy that succeeded in every language', async () => {
    const czech = await makeVersion();
    const slovak = await makeVersion({ language: 'sk' });
    const { deployment } = await harness().deploy([czech.version.id, slovak.version.id]);

    const czechLanguage = await seededLanguage('cs');
    const mine = toDeploymentView(deployment!, new Set([czechLanguage.id]));

    assert.equal(deployment?.status, DeploymentStatus.SUCCEEDED);
    assert.equal(mine.error, null);
    assert.equal(mine.items[0].versionDeployed, true);
  });
});

describe('auto-deploy on approval', () => {
  it('is off until a project turns it on, and is set per project and language', async () => {
    const { version } = await makeVersion();
    const project = await repository.getTranslationProjectForVersion(version.id);
    assert.ok(project);
    const before = project.autoDeploy;
    try {
      assert.equal(before, false);
      await repository.setTranslationProjectAutoDeploy(project.id, true);
      assert.equal((await repository.getTranslationProjectForVersion(version.id))?.autoDeploy, true);
    } finally {
      await repository.setTranslationProjectAutoDeploy(project.id, before);
    }
  });
});
