import { NextRequest, NextResponse } from 'next/server';
import { sweepAiSteps } from '@/domain/ai-workflow/ai-workflow.runtime';
import { hasBearerSecret } from '@/lib/bearer';

const LOG_PREFIX = '[AI Workflow Sweep]';

/** A sweep translates several documents in turn, each a model call of its own. */
export const maxDuration = 300;

/**
 * Scheduled sweep for the AI workflow: drafts nobody started, audio texts
 * still to prepare, approved documents waiting for their recording before
 * they deploy, and failed steps due a retry. Triggered by a Coolify scheduled
 * task (see docs/AI_WORKFLOW.md):
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $AI_WORKFLOW_SWEEP_SECRET" http://localhost:3000/api/ai-workflow/sweep
 */
export async function POST(request: NextRequest) {
  const secret = process.env.AI_WORKFLOW_SWEEP_SECRET;
  if (!secret) {
    console.log(`${LOG_PREFIX} AI_WORKFLOW_SWEEP_SECRET is not set; refusing`);
    return NextResponse.json({ error: 'Sweep is not configured' }, { status: 503 });
  }

  if (!hasBearerSecret(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await sweepAiSteps());
}
