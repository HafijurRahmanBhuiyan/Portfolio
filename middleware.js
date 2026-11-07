import { NextResponse } from 'next/server';

// Page/document CSP owner. API responses are owned by Express (server.js);
// common non-CSP headers are owned by next.config.mjs. The matcher excludes
// /api so two different CSP policies never apply to one response.
export function middleware(request) {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const devEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  const httpsEnforced =
    process.env.NODE_ENV === 'production' &&
    process.env.HTTPS_TERMINATED === 'true';
  const finalPolicy = httpsEnforced
    ? `${policy}; upgrade-insecure-requests`
    : policy;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', finalPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', finalPolicy);
  if (httpsEnforced) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
