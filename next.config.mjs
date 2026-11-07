import { apiRewriteDestination } from './lib/deployment.js';

// Vercel must set API_INTERNAL_URL to the Render API origin. The value is used
// only in the server-side rewrite and is never exposed to the browser bundle.
// Docker Compose sets it to the internal service URL at build time.
const apiDestination = apiRewriteDestination(process.env);
const httpsEnforced =
  process.env.NODE_ENV === 'production' &&
  process.env.HTTPS_TERMINATED === 'true';

const commonHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

if (httpsEnforced) {
  commonHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  });
}

const config = {
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: apiDestination }];
  },
  async headers() {
    return [{ source: '/:path*', headers: commonHeaders }];
  },
};
export default config;
