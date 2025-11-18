import { getSessionCookie } from 'better-auth/cookies';
import { NextRequest, NextResponse } from 'next/server';

// Paths that require authentication
const protectedPaths = ['/dashboard', '/documents', '/admin', '/onboarding'];

// Paths that are public (auth pages)
const publicPaths = ['/login', '/register', '/'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if path requires authentication
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  // Skip middleware for API routes, static files
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }

  // Get session cookie (this is just for optimistic redirects, not security)
  const sessionCookie = getSessionCookie(request);

  // If accessing protected path without session cookie, redirect to login
  // NOTE: This is NOT a security check - actual validation happens in each page
  if (isProtectedPath && !sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If accessing public auth pages with session cookie, redirect to dashboard
  if ((pathname === '/login' || pathname === '/register') && sessionCookie) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
};
