import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanProject } from './lib/projects.js';
import { resolveConfig } from './lib/config.js';
import { runMigrations } from './lib/migrations.js';
import {
  API_LISTEN_HOST,
  resolveApiPort,
  resolveUploadsDir,
} from './lib/runtime.js';

const { Pool } = pg;
const root = path.dirname(fileURLToPath(import.meta.url));

let config;
try {
  config = resolveConfig(process.env);
} catch {
  console.error(JSON.stringify({ type: 'configuration_error' }));
  process.exit(1);
}

const {
  production,
  secureCookies,
  trustProxyHops,
  allowedOrigins: trustedOrigins,
  adminEmail,
  passwordHash,
  sessionSecret,
  sessionCookieName: sessionCookie,
  sessionAbsoluteMs: absoluteMs,
  sessionIdleMs: idleMs,
} = config;
const allowedOrigins = new Set(trustedOrigins);

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (error) => {
  console.log(
    JSON.stringify({
      type: 'database_pool_error',
      sqlState: error?.code || 'unknown',
    }),
  );
});
let port;
try {
  // Render injects PORT; Docker Compose keeps using API_PORT because the API
  // service does not set PORT. The listener always binds to 0.0.0.0.
  port = resolveApiPort(process.env);
} catch {
  console.error(JSON.stringify({ type: 'configuration_error' }));
  process.exit(1);
}
const requestId = () => crypto.randomUUID();
const hash = (value) =>
  crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
const secureCookie = secureCookies;

// Project logos are stored on a dedicated volume in Docker and on a mounted
// persistent disk on Render. Production configuration requires UPLOAD_DIR, so
// uploads are never written to the ephemeral application filesystem.
const uploadsDir = resolveUploadsDir(process.env, root);
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/png': { extension: 'png' },
  'image/jpeg': { extension: 'jpg' },
  'image/webp': { extension: 'webp' },
  'image/gif': { extension: 'gif' },
};
const UPLOAD_EXTENSION_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const uploadBody = express.raw({
  type: Object.keys(IMAGE_TYPES),
  limit: MAX_UPLOAD_BYTES,
});

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return '';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image/jpeg';
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return '';
}

app.disable('x-powered-by');
app.set('trust proxy', trustProxyHops);
app.use((req, res, next) => {
  req.id = requestId();
  res.set('X-Request-ID', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () =>
    console.log(
      JSON.stringify({
        type: 'http_request',
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      }),
    ),
  );
  next();
});
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Content-Security-Policy':
      "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Cache-Control': 'no-store',
    ...(production && config.httpsTerminated
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  });
  next();
});
app.use(express.json({ limit: '150kb', strict: true }));

function cookieValue(req) {
  const match = (req.headers.cookie || '').match(
    /(?:^|;\s*)dev_session=([^;]+)/,
  );
  try {
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}
function cookieOptions(maxAge = absoluteMs) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookie,
    path: '/',
    maxAge,
  };
}
function trustedOrigin(req) {
  const origin = req.get('Origin');
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  return !production && origin === `http://${req.get('host')}`;
}
async function getSession(req, touch = true) {
  const token = cookieValue(req);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = Date.now();
  const { rows } = await pool.query(
    'SELECT token_hash, csrf_hash, admin_id, created_at, last_seen_at, expires_at, revoked FROM admin_sessions WHERE token_hash=$1',
    [hash(token)],
  );
  const session = rows[0];
  if (
    !session ||
    session.revoked ||
    new Date(session.expires_at).getTime() <= now ||
    new Date(session.last_seen_at).getTime() + idleMs <= now ||
    new Date(session.created_at).getTime() + absoluteMs <= now
  )
    return null;
  // The CSRF token is deterministically derived from the opaque session token
  // so the server can return it on every authenticated read without storing
  // the raw value. Only its HMAC is persisted.
  session.csrf_token = hash(`csrf:${token}`);
  if (touch && now - new Date(session.last_seen_at).getTime() > 60_000)
    await pool.query(
      'UPDATE admin_sessions SET last_seen_at=now() WHERE token_hash=$1',
      [session.token_hash],
    );
  return session;
}
async function requireAdmin(req, res, next) {
  try {
    req.session = await getSession(req);
    if (!req.session)
      return res.status(401).json({ error: 'Please sign in again.' });
    next();
  } catch {
    res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
}
async function mutationProtection(req, res, next) {
  if (!trustedOrigin(req))
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  try {
    const session = await getSession(req);
    if (!session)
      return res.status(401).json({ error: 'Please sign in again.' });
    if (
      !req.get('X-CSRF-Token') ||
      !crypto.timingSafeEqual(
        Buffer.from(hash(req.get('X-CSRF-Token'))),
        Buffer.from(session.csrf_hash),
      )
    )
      return res.status(403).json({ error: 'Request verification failed.' });
    req.session = session;
    next();
  } catch {
    res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
}
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    // Render health checks must fail when the persistent upload disk is not
    // mounted or is read-only; a writable check alone does not prove the disk
    // is persistent, but it catches the most common misconfiguration.
    await fs.promises.access(uploadsDir, fs.constants.W_OK);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.post('/api/login', async (req, res) => {
  if (!trustedOrigin(req))
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  const email =
    typeof req.body?.email === 'string' && req.body.email.length <= 254
      ? req.body.email.trim().toLowerCase()
      : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password : '';
  if (!adminEmail || !passwordHash)
    return res.status(503).json({ error: 'Sign-in is unavailable.' });
  try {
    const keys = [hash(`ip:${req.ip}`), hash(`account:${email}`)];
    const { rows } = await pool.query(
      'SELECT bucket,blocked_until FROM login_attempts WHERE bucket=ANY($1)',
      [keys],
    );
    if (
      rows.some(
        (row) => row.blocked_until && new Date(row.blocked_until) > new Date(),
      )
    ) {
      console.log(
        JSON.stringify({ type: 'auth_rate_limited', requestId: req.id }),
      );
      return res
        .status(429)
        .json({ error: 'Too many sign-in attempts. Try again later.' });
    }
    let valid = false;
    try {
      const argon2 = await import('argon2');
      valid = await argon2.verify(passwordHash, password);
    } catch {
      valid = false;
    }
    if (
      !crypto.timingSafeEqual(
        crypto.createHash('sha256').update(email).digest(),
        crypto.createHash('sha256').update(adminEmail).digest(),
      ) ||
      !valid
    ) {
      for (const key of keys)
        await pool.query(
          `INSERT INTO login_attempts(bucket,failures,blocked_until,updated_at) VALUES($1,1,NULL,now()) ON CONFLICT(bucket) DO UPDATE SET failures=login_attempts.failures+1, blocked_until=CASE WHEN login_attempts.failures+1>=10 THEN now()+LEAST(15,power(2,LEAST(login_attempts.failures-8,4))) * interval '1 minute' ELSE NULL END, updated_at=now()`,
          [key],
        );
      console.log(JSON.stringify({ type: 'auth_failure', requestId: req.id }));
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    await pool.query('DELETE FROM login_attempts WHERE bucket=ANY($1)', [keys]);
    const client = await pool.connect();
    const token = crypto.randomBytes(32).toString('base64url');
    const csrf = hash(`csrf:${token}`);
    try {
      await client.query('BEGIN');
      const old = cookieValue(req);
      if (old)
        await client.query(
          'UPDATE admin_sessions SET revoked=true WHERE token_hash=$1',
          [hash(old)],
        );
      await client.query(
        "INSERT INTO admin_sessions(token_hash,csrf_hash,admin_id,created_at,last_seen_at,expires_at) VALUES($1,$2,$3,now(),now(),now()+interval '8 hours')",
        [hash(token), hash(csrf), adminEmail],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.cookie(sessionCookie, token, cookieOptions());
    console.log(JSON.stringify({ type: 'auth_success', requestId: req.id }));
    res.json({ ok: true, csrfToken: csrf });
  } catch {
    res.status(503).json({ error: 'Sign-in is temporarily unavailable.' });
  }
});
app.post('/api/logout', mutationProtection, async (req, res) => {
  await pool.query(
    'UPDATE admin_sessions SET revoked=true WHERE token_hash=$1',
    [req.session.token_hash],
  );
  res.clearCookie(sessionCookie, cookieOptions(0));
  res.json({ ok: true });
});
app.post('/api/uploads', mutationProtection, uploadBody, async (req, res) => {
  const declared = String(req.get('Content-Type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!IMAGE_TYPES[declared])
    return res
      .status(415)
      .json({ error: 'Upload a PNG, JPG, WebP, or GIF image.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length)
    return res.status(400).json({ error: 'Choose a non-empty image file.' });
  if (req.body.length > MAX_UPLOAD_BYTES)
    return res.status(413).json({ error: 'Request is too large.' });
  const detected = detectImageType(req.body);
  if (!detected)
    return res
      .status(415)
      .json({ error: 'The file contents are not a supported image.' });
  if (detected !== declared)
    return res.status(415).json({
      error: 'The image type does not match the uploaded file contents.',
    });
  const extension = IMAGE_TYPES[detected].extension;
  const filename = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
  const target = path.join(uploadsDir, filename);
  try {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    await fs.promises.writeFile(target, req.body, {
      flag: 'wx',
      mode: 0o644,
    });
    await pool.query(
      'INSERT INTO admin_audit(request_id,session_ref,actor,action,resource,summary) VALUES($1,$2,$3,$4,$5,$6)',
      [
        req.id,
        req.session.token_hash,
        req.session.admin_id,
        'upload',
        'projects',
        JSON.stringify({
          image: filename,
          type: detected,
          bytes: req.body.length,
        }),
      ],
    );
    res
      .status(201)
      .set('Cache-Control', 'no-store')
      .json({
        ok: true,
        path: `api/uploads/${filename}`,
        url: `/api/uploads/${filename}`,
      });
  } catch (error) {
    console.log(
      JSON.stringify({
        type: 'upload_failed',
        requestId: req.id,
        sqlState: error?.code || 'unknown',
      }),
    );
    try {
      await fs.promises.unlink(target);
    } catch {}
    res.status(500).json({ error: 'Could not store the image.' });
  }
});
app.get('/api/uploads/:file', (req, res) => {
  const match = /^([0-9a-f]{32})\.(png|jpg|webp|gif)$/.exec(req.params.file);
  if (!match) return res.status(404).json({ error: 'Not found.' });
  const target = path.join(uploadsDir, req.params.file);
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile())
      return res.status(404).json({ error: 'Not found.' });
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': UPLOAD_EXTENSION_TYPES[match[2]],
      'Content-Disposition': `inline; filename="${req.params.file}"`,
    });
    res.sendFile(target, (sendError) => {
      if (sendError && !res.headersSent)
        res.status(404).json({ error: 'Not found.' });
    });
  });
});
app.get('/api/public-projects', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT data FROM projects ORDER BY sort_order,id',
    );
    res.set('Cache-Control', 'no-store');
    res.json(rows.map((x) => x.data));
  } catch {
    res.status(503).json({ error: 'Projects are temporarily unavailable.' });
  }
});
app.get('/api/projects', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT p.data,c.version FROM project_collection c LEFT JOIN projects p ON true WHERE c.id=1 ORDER BY p.sort_order NULLS LAST,p.id',
    );
    res.set('ETag', `"${rows[0].version}"`);
    res.set('X-CSRF-Token', req.session.csrf_token);
    res.json(rows.filter((row) => row.data !== null).map((row) => row.data));
  } catch {
    res.status(503).json({ error: 'Projects are temporarily unavailable.' });
  }
});
app.put('/api/projects', mutationProtection, async (req, res) => {
  let projects;
  try {
    if (!Array.isArray(req.body) || req.body.length > 100)
      throw new Error('invalid:list');
    projects = req.body.map(cleanProject);
    if (new Set(projects.map((p) => p.id)).size !== projects.length)
      throw new Error('invalid:duplicate');
  } catch {
    return res.status(400).json({ error: 'Invalid project list.' });
  }
  const match = /^"(\d+)"$/.exec(req.get('If-Match') || '');
  if (!match)
    return res.status(428).json({ error: 'Refresh projects before saving.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT version FROM project_collection WHERE id=1 FOR UPDATE',
    );
    if (Number(match[1]) !== current.rows[0].version) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error:
          'Projects changed in another session. Refresh and review the latest version.',
      });
    }
    await client.query('DELETE FROM projects');
    for (let i = 0; i < projects.length; i++)
      await client.query(
        'INSERT INTO projects(id,sort_order,data) VALUES($1,$2,$3)',
        [projects[i].id, i, projects[i]],
      );
    const updated = await client.query(
      'UPDATE project_collection SET version=version+1,updated_at=now() WHERE id=1 RETURNING version',
    );
    await client.query(
      'INSERT INTO admin_audit(request_id,session_ref,actor,action,resource,summary) VALUES($1,$2,$3,$4,$5,$6)',
      [
        req.id,
        req.session.token_hash,
        req.session.admin_id,
        'replace',
        'projects',
        JSON.stringify({ count: projects.length }),
      ],
    );
    await client.query('COMMIT');
    res.set('ETag', `"${updated.rows[0].version}"`).json({ ok: true });
  } catch (error) {
    console.log(
      JSON.stringify({
        type: 'project_write_failed',
        requestId: req.id,
        sqlState: error?.code || 'unknown',
      }),
    );
    try {
      await client.query('ROLLBACK');
    } catch {}
    res.status(500).json({ error: 'Could not save projects.' });
  } finally {
    client.release();
  }
});
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, _req, res, _next) => {
  const status =
    error?.type === 'entity.too.large'
      ? 413
      : error instanceof SyntaxError
        ? 400
        : 500;
  res.status(status).json({
    error:
      status === 413
        ? 'Request is too large.'
        : status === 400
          ? 'Invalid request.'
          : 'Service temporarily unavailable.',
  });
});

let server;
async function initializeDatabase() {
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  await fs.promises.access(uploadsDir, fs.constants.W_OK);
  console.log(JSON.stringify({ type: 'upload_store_ready' }));
  await runMigrations(pool, root);
  const { rows } = await pool.query(
    'SELECT count(*)::int AS count FROM projects',
  );
  if (!rows[0].count) {
    const seed = JSON.parse(
      fs.readFileSync(path.join(root, 'projects.json'), 'utf8'),
    );
    for (let i = 0; i < seed.length; i++) {
      const project = cleanProject({
        ...seed[i],
        id: seed[i].id || crypto.randomUUID(),
      });
      await pool.query(
        'INSERT INTO projects(id,sort_order,data) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
        [project.id, i, project],
      );
    }
  }
  server = app.listen(port, API_LISTEN_HOST, () =>
    console.log(JSON.stringify({ type: 'server_ready', port })),
  );
  const cleanup = setInterval(
    () => {
      pool
        .query(
          "DELETE FROM admin_sessions WHERE expires_at < now() OR last_seen_at < now()-interval '30 minutes' OR (revoked AND last_seen_at < now()-interval '7 days')",
        )
        .catch(() => {});
      pool
        .query(
          "DELETE FROM login_attempts WHERE updated_at < now()-interval '1 day'",
        )
        .catch(() => {});
      // Audit records are retained for 365 days. They contain only request
      // IDs, HMAC session references, actor identity, and non-secret summaries.
      pool
        .query(
          "DELETE FROM admin_audit WHERE created_at < now()-interval '365 days'",
        )
        .catch(() => {});
    },
    60 * 60 * 1000,
  );
  cleanup.unref();
}
initializeDatabase().catch(() => {
  console.error(JSON.stringify({ type: 'startup_failed' }));
  process.exit(1);
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
  console.log(JSON.stringify({ type: 'shutdown_complete' }));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
