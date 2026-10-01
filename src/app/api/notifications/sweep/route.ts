import { NextRequest, NextResponse } from 'next/server';
import { runNotificationSweep } from '@/domain/notification/notification.service';
import { hasBearerSecret } from '@/lib/bearer';

const LOG_PREFIX = '[Notification Sweep]';

/**
 * Scheduled run that creates deadline reminders and sends email digests.
 * Triggered by a Coolify scheduled task (see docs/NOTIFICATIONS.md):
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $NOTIFICATIONS_SWEEP_SECRET" http://localhost:3000/api/notifications/sweep
 *
 * Outside production, `?now=<ISO date>` runs the sweep as if it were that
 * moment, so reminders and digests can be tried without waiting for them.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATIONS_SWEEP_SECRET;
  if (!secret) {
    console.log(`${LOG_PREFIX} NOTIFICATIONS_SWEEP_SECRET is not set; refusing`);
    return NextResponse.json({ error: 'Sweep is not configured' }, { status: 503 });
  }

  if (!hasBearerSecret(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runNotificationSweep(sweepTime(request));
  return NextResponse.json(result);
}

function sweepTime(request: NextRequest): Date {
  const requested = request.nextUrl.searchParams.get('now');
  if (!requested || process.env.NODE_ENV === 'production') return new Date();
  const date = new Date(requested);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
