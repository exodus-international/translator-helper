import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextRequest, NextResponse } from 'next/server';

const betterAuthHandler = toNextJsHandler(auth.handler);

export const GET = betterAuthHandler.GET;

export async function POST(request: NextRequest) {
  // Block direct signup — registration must go through invitation flow
  if (request.nextUrl.pathname === '/api/auth/sign-up/email') {
    return NextResponse.json(
      { error: 'Registration is by invitation only' },
      { status: 403 },
    );
  }
  return betterAuthHandler.POST(request);
}
