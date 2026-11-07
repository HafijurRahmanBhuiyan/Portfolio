/**
 * Deployment-specific helpers shared by the API configuration, the Next.js
 * rewrite configuration, and the regression tests.
 *
 * These functions never log or return secret values. Errors describe the
 * requirement only, so a misconfigured deployment cannot leak credentials.
 */

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

export function isLocalhostHostname(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return LOCAL_HOSTNAMES.has(host);
}

export function normalizeBaseUrl(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, '');
}

/**
 * Neon exposes a PgBouncer-based pooler on a `-pooler` hostname. The startup
 * migration uses a session-level advisory lock, which a transaction pooler
 * cannot guarantee. Require the direct (non-pooled) Neon endpoint.
 */
export function isNeonPooledUrl(value) {
  try {
    const url = new URL(String(value));
    return /-pooler\./i.test(url.hostname);
  } catch {
    return false;
  }
}

export function hasRequiredSslMode(value) {
  try {
    const url = new URL(String(value));
    const mode = String(url.searchParams.get('sslmode') || '').toLowerCase();
    return ['require', 'verify-ca', 'verify-full'].includes(mode);
  } catch {
    return false;
  }
}

/**
 * Validate a PostgreSQL connection string without revealing it.
 *
 * `production` requires TLS because both Neon and Render terminate over the
 * public internet. Docker Compose keeps using the PG* variables and is not
 * affected by this check.
 */
export function assertDatabaseUrlCompatibility(
  value,
  { production = false } = {},
) {
  const raw = String(value ?? '').trim();
  if (!raw) return;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('DATABASE_URL must use the postgres or postgresql scheme.');
  if (isNeonPooledUrl(raw))
    throw new Error(
      'DATABASE_URL must use a direct Neon connection, not a pooled -pooler host.',
    );
  if (production && !hasRequiredSslMode(raw))
    throw new Error(
      'DATABASE_URL must include sslmode=require in production deployments.',
    );
}

/**
 * Resolve the API base used by the Next.js rewrite.
 *
 * On Vercel production builds the destination must be explicit, HTTPS, and
 * non-local. Docker Compose builds keep using the internal service name.
 */
export function resolveApiDestination(env = process.env) {
  const raw = String(env.API_INTERNAL_URL || '').trim();
  const vercelProduction =
    String(env.VERCEL || '') === '1' &&
    String(env.NODE_ENV || '') === 'production';

  if (vercelProduction) {
    if (!raw)
      throw new Error(
        'API_INTERNAL_URL is required for Vercel production builds.',
      );
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('API_INTERNAL_URL must be a valid URL.');
    }
    if (url.protocol !== 'https:')
      throw new Error(
        'API_INTERNAL_URL must use HTTPS for Vercel production builds.',
      );
    if (isLocalhostHostname(url.hostname))
      throw new Error(
        'API_INTERNAL_URL must not use localhost for Vercel production builds.',
      );
    if (url.pathname !== '/' || url.search || url.hash)
      throw new Error(
        'API_INTERNAL_URL must be an origin without a path, query, or fragment.',
      );
    return normalizeBaseUrl(raw);
  }

  return normalizeBaseUrl(raw || 'http://localhost:4000');
}

export function apiRewriteDestination(env = process.env) {
  return `${resolveApiDestination(env)}/api/:path*`;
}
