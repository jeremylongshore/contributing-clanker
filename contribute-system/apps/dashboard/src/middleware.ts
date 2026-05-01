/**
 * Next.js Middleware
 *
 * Handles host detection and sets appropriate headers for multi-site support.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Map of domains to site IDs
const SITE_MAP: Record<string, string> = {
  'intentsolutions.io': 'intent',
  'www.intentsolutions.io': 'intent',
  'startaitools.io': 'startai',
  'www.startaitools.io': 'startai',
  'jeremylongshore.com': 'jeremy',
  'www.jeremylongshore.com': 'jeremy',
};

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || 'localhost';
  const cleanHost = hostname.replace(/:\d+$/, '');
  const siteId = SITE_MAP[cleanHost] || 'default';

  // Clone the response
  const response = NextResponse.next();

  // Set site ID header for client-side detection
  response.headers.set('x-site-id', siteId);
  response.headers.set('x-site-host', cleanHost);

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
