import path from 'node:path';
import { assertDatabaseUrlCompatibility } from './deployment.js';

/**
 * Central environment policy.
 *
 * Canonical rule: production mode is enabled when either NODE_ENV or APP_ENV
 * says "production", and any explicit contradictory value is a startup error.
 * NODE_ENV=production can therefore never be downgraded by APP_ENV=development.
 *
 * Every validation failure throws the same generic, non-secret error so a
 * misconfigured deployment cannot leak partial configuration in logs.
 */

const CONFIGURATION_ERROR =
  'Server configuration is invalid. Verify environment variables and the required production security settings.';

const ENVIRONMENTS = new Set(['production', 'development', 'test']);

function normalized(env, key) {
  const value = env[key];
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function fail() {
  const error = new Error(CONFIGURATION_ERROR);
  error.name = 'ConfigurationError';
  throw error;
}

export function parseTrustProxyHops(value) {
  const raw =
    value === undefined || value === null || value === ''
      ? '0'
      : String(value).trim();
  if (!/^\d+$/.test(raw)) fail();
  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 10) fail();
  return hops;
}

export function isStrongArgon2idHash(value) {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(
    String(value || ''),
  );
  if (!match) return false;
  return (
    Number(match[1]) >= 19456 && Number(match[2]) >= 2 && Number(match[3]) >= 1
  );
}

// Reject obvious placeholders and the development-only fallbacks used by
// docker-compose.dev.yml. These values are public knowledge and must never be
// accepted by a production configuration, even if someone copies them.
const PLACEHOLDER_SECRET =
  /^(change|replace|secret|password|dev-only|do-not-use|placeholder|example|test-only)/i;

export function isStrongSessionSecret(value) {
  const secret = String(value || '');
  return (
    /^[A-Za-z0-9_-]{43,}$/.test(secret) &&
    new Set(secret).size >= 12 &&
    !PLACEHOLDER_SECRET.test(secret)
  );
}

export function isStrongDatabasePassword(value) {
  const password = String(value || '');
  return (
    Buffer.byteLength(password) >= 24 &&
    new Set(password).size >= 10 &&
    !PLACEHOLDER_SECRET.test(password)
  );
}

export function parseTrustedOrigins(value) {
  const raw = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const origins = [];
  for (const item of raw) {
    let url;
    try {
      url = new URL(item);
    } catch {
      fail();
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hostname.includes('*') ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      fail();
    origins.push(url.origin);
  }
  return origins;
}

function databasePasswordFrom(env) {
  if (env.PGPASSWORD) return String(env.PGPASSWORD);
  if (!env.DATABASE_URL) return '';
  try {
    return decodeURIComponent(new URL(env.DATABASE_URL).password || '');
  } catch {
    return '';
  }
}

/**
 * Resolve and validate all security-relevant environment values.
 * @param {Record<string, string | undefined>} env
 */
export function resolveConfig(env = process.env) {
  const nodeEnv = normalized(env, 'NODE_ENV');
  const appEnv = normalized(env, 'APP_ENV');
  if (
    (nodeEnv && !ENVIRONMENTS.has(nodeEnv)) ||
    (appEnv && !ENVIRONMENTS.has(appEnv))
  )
    fail();

  const nodeProduction = nodeEnv === 'production';
  const appProduction = appEnv === 'production';
  if (
    (nodeProduction && appEnv && !appProduction) ||
    (appProduction && nodeEnv && !nodeProduction)
  )
    fail();

  const production = nodeProduction || appProduction;
  const httpsTerminated = normalized(env, 'HTTPS_TERMINATED') === 'true';
  const trustProxyHops = parseTrustProxyHops(env.TRUST_PROXY_HOPS);
  const allowedOrigins = parseTrustedOrigins(env.TRUSTED_ORIGINS);
  const adminEmail = String(env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const passwordHash = String(env.ADMIN_PASSWORD_HASH || '');
  const sessionSecret = String(env.SESSION_SECRET || '');
  const databasePassword = databasePasswordFrom(env);
  const uploadDir = String(env.UPLOAD_DIR || '').trim();
  const renderHosted = normalized(env, 'RENDER') === 'true';

  // A pooled Neon URL cannot safely run the session-level advisory lock used
  // by startup migrations. Production also requires TLS to the database.
  try {
    assertDatabaseUrlCompatibility(env.DATABASE_URL, { production });
  } catch {
    fail();
  }

  // Render sets RENDER=true automatically. Require the managed database URL
  // and production mode so a Render service cannot accidentally start with
  // development cookies or the ephemeral local upload directory.
  if (renderHosted) {
    if (!production || !String(env.DATABASE_URL || '').trim()) fail();
  }

  if (production) {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
    const validOrigins =
      allowedOrigins.length > 0 &&
      allowedOrigins.every((origin) => {
        try {
          const url = new URL(origin);
          return (
            url.protocol === 'https:' &&
            url.hostname !== 'localhost' &&
            url.hostname !== '127.0.0.1' &&
            url.hostname !== '0.0.0.0' &&
            url.hostname !== '::1' &&
            url.hostname !== '[::1]'
          );
        } catch {
          return false;
        }
      });
    // Render's filesystem is ephemeral. Production must point UPLOAD_DIR at a
    // mounted persistent disk (Render) or a named volume (Docker Compose).
    const validUploadDir = Boolean(uploadDir) && path.isAbsolute(uploadDir);
    if (
      !httpsTerminated ||
      !validEmail ||
      !validOrigins ||
      !validUploadDir ||
      !isStrongArgon2idHash(passwordHash) ||
      !isStrongSessionSecret(sessionSecret) ||
      !isStrongDatabasePassword(databasePassword)
    )
      fail();
  } else if (passwordHash && !passwordHash.startsWith('$argon2id$')) {
    fail();
  }

  return {
    production,
    secureCookies: production || httpsTerminated,
    httpsTerminated,
    trustProxyHops,
    allowedOrigins,
    adminEmail,
    passwordHash,
    sessionSecret,
    databasePassword,
    uploadDir,
    renderHosted,
    sessionCookieName: 'dev_session',
    sessionAbsoluteMs: 8 * 60 * 60 * 1000,
    sessionIdleMs: 30 * 60 * 1000,
  };
}
