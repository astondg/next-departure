/**
 * Legacy e-ink endpoint — redirects to /api/og/board.
 *
 * The main OG route now buffers its response and includes Content-Length
 * directly, so this proxy layer is no longer needed. Kept as a redirect
 * for backwards compatibility with devices that haven't updated their URL.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const target = new URL('/api/og/board', url.origin);
  target.search = url.search;
  return NextResponse.redirect(target, 307);
}
