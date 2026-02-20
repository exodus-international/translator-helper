import { NextRequest, NextResponse } from 'next/server';
import { GitHubPRStatus } from '@prisma/client';
import { verifyWebhookSignature } from '@/domain/github/github.service';
import { getGitHubCommitsByPRNumber, updateGitHubCommitPRStatus } from '@/domain/github/github.repository';
import { pullRequestWebhookSchema } from '@/domain/github/github.types';

const LOG_PREFIX = '[GitHub Webhook]';

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} Received webhook request`);

  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) {
    console.log(`${LOG_PREFIX} Missing x-hub-signature-256 header`);
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  const body = await request.text();
  console.log(`${LOG_PREFIX} Payload size: ${body.length} bytes`);

  try {
    const isValid = verifyWebhookSignature(body, signature);
    if (!isValid) {
      console.log(`${LOG_PREFIX} Invalid signature`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Signature verification error:`, error.message);
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  console.log(`${LOG_PREFIX} Event type: ${event}`);

  if (event !== 'pull_request') {
    console.log(`${LOG_PREFIX} Ignoring non-pull_request event: ${event}`);
    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
  }

  let payload;
  try {
    payload = pullRequestWebhookSchema.parse(JSON.parse(body));
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Invalid payload:`, error.message);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  console.log(`${LOG_PREFIX} PR #${payload.pull_request.number} — action: ${payload.action}, merged: ${payload.pull_request.merged}`);

  if (payload.action !== 'closed') {
    console.log(`${LOG_PREFIX} Ignoring action: ${payload.action} (only handling "closed")`);
    return NextResponse.json({ message: 'Action ignored' }, { status: 200 });
  }

  const prNumber = payload.pull_request.number;
  const newStatus = payload.pull_request.merged ? GitHubPRStatus.MERGED : GitHubPRStatus.CLOSED;

  console.log(`${LOG_PREFIX} Looking up GitHubCommit records for PR #${prNumber}`);
  const commits = await getGitHubCommitsByPRNumber(prNumber);
  console.log(`${LOG_PREFIX} Found ${commits.length} commit record(s)`);

  for (const commit of commits) {
    console.log(`${LOG_PREFIX} Updating commit ${commit.id} status to ${newStatus}`);
    await updateGitHubCommitPRStatus(commit.id, newStatus);
  }

  console.log(`${LOG_PREFIX} Done — updated ${commits.length} commit(s) to ${newStatus}`);
  return NextResponse.json(
    { message: `Updated ${commits.length} commit(s) to ${newStatus}` },
    { status: 200 },
  );
}
