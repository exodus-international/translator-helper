import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { sweepPendingJobs } from '@/domain/audio/audio.service';

const LOG_PREFIX = '[Audio Sweep]';

/**
 * Scheduled sweep for audio jobs whose review page nobody has open.
 * Triggered by a Coolify scheduled task (see docs/AUDIO.md):
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $AUDIO_SWEEP_SECRET" http://localhost:3000/api/audio/sweep
 */
export async function POST(request: NextRequest) {
  const secret = process.env.AUDIO_SWEEP_SECRET;
  if (!secret) {
    console.log(`${LOG_PREFIX} AUDIO_SWEEP_SECRET is not set; refusing`);
    return NextResponse.json({ error: 'Sweep is not configured' }, { status: 503 });
  }

  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(presented, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await sweepPendingJobs();
  return NextResponse.json(result);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
