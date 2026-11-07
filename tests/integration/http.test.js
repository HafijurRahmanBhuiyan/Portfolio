import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const base = process.env.SMOKE_BASE_URL;
const origin = process.env.SMOKE_ORIGIN || (base ? new URL(base).origin : '');
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || '';
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || '';
const databaseUrl = process.env.SMOKE_DATABASE_URL || '';
const sessionSecret = process.env.SMOKE_SESSION_SECRET || '';
const expectHsts = process.env.SMOKE_EXPECT_HSTS !== 'false';
const skip = !base && 'Set SMOKE_BASE_URL or run npm run test:integration.';

function endpoint(path) {
  return new URL(path, base);
}

// The API stores only HMAC-SHA-256 session references. Tests use the isolated
// run's generated secret to target the exact row without touching other rows.
function tokenHash(token) {
  assert.ok(sessionSecret, 'SMOKE_SESSION_SECRET is required for DB checks');
  return crypto.createHmac('sha256', sessionSecret).update(token).digest('hex');
}

function assertCommonHeaders(response, label) {
  assert.equal(
    response.headers.get('x-content-type-options'),
    'nosniff',
    label,
  );
  assert.equal(
    response.headers.get('referrer-policy'),
    'strict-origin-when-cross-origin',
    label,
  );
  assert.match(
    response.headers.get('permissions-policy') || '',
    /camera=\(\)/,
    label,
  );
  assert.equal(response.headers.get('x-frame-options'), 'DENY', label);
  assert.equal(
    response.headers.get('cross-origin-opener-policy'),
    'same-origin',
    label,
  );
  assert.equal(
    response.headers.get('cross-origin-resource-policy'),
    'same-origin',
    label,
  );
  assert.equal(response.headers.get('x-powered-by'), null, label);
  if (expectHsts)
    assert.match(
      response.headers.get('strict-transport-security') || '',
      /max-age=31536000/,
      label,
    );
}

function assertPageCsp(response, label) {
  const csp = response.headers.get('content-security-policy') || '';
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "'nonce-",
    "'strict-dynamic'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ])
    assert.ok(csp.includes(directive), `${label} CSP missing ${directive}`);
}

function assertApiCsp(response, label) {
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'none'/, label);
  assert.match(csp, /object-src 'none'/, label);
  assert.match(csp, /frame-ancestors 'none'/, label);
  assert.match(csp, /base-uri 'none'/, label);
  assert.match(csp, /form-action 'none'/, label);
}

async function login(password = adminPassword, requestOrigin = origin) {
  return fetch(endpoint('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
    body: JSON.stringify({ email: adminEmail, password }),
  });
}

async function authenticatedSession() {
  const response = await login();
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie') || '';
  assert.ok(setCookie, 'login must set a session cookie');
  const cookie = setCookie.split(';')[0];
  const data = await response.json();
  const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  return { cookie, csrf: data.csrfToken, token, setCookie };
}

function putProjects(cookie, csrf, etag, body, requestOrigin = origin) {
  const headers = {
    Cookie: cookie,
    Origin: requestOrigin,
    'Content-Type': 'application/json',
  };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (etag) headers['If-Match'] = etag;
  return fetch(endpoint('/api/projects'), {
    method: 'PUT',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function uploadImage(
  cookie,
  csrf,
  body,
  contentType = 'image/png',
  requestOrigin = origin,
) {
  const headers = { Origin: requestOrigin, 'Content-Type': contentType };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return fetch(endpoint('/api/uploads'), { method: 'POST', headers, body });
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=',
  'base64',
);

test(
  'isolated HTTP integration: routes, headers, auth, sessions, CSRF, concurrency, audit, and rate limiting',
  { skip },
  async (t) => {
    const db = databaseUrl
      ? new pg.Pool({ connectionString: databaseUrl, max: 2 })
      : null;
    t.after(async () => {
      if (db) await db.end();
    });

    await t.test(
      'public routes, API routes, and security headers',
      async () => {
        for (const path of ['/', '/developer']) {
          const response = await fetch(endpoint(path));
          assert.equal(response.status, 200, path);
          assertCommonHeaders(response, path);
          assertPageCsp(response, path);
          const body = await response.text();
          if (path === '/') assert.match(body, /id="portfolio-root"/);
          else assert.match(body, /id="loginPanel"/);
        }

        const css = await fetch(endpoint('/css/style.css'));
        assert.equal(css.status, 200);
        assertCommonHeaders(css, 'static css');

        const health = await fetch(endpoint('/api/health'));
        assert.equal(health.status, 200);
        assertCommonHeaders(health, '/api/health');
        assertApiCsp(health, '/api/health');
        assert.deepEqual(await health.json(), { ok: true });

        const ready = await fetch(endpoint('/api/ready'));
        assert.equal(ready.status, 200);
        assertCommonHeaders(ready, '/api/ready');
        assertApiCsp(ready, '/api/ready');
        assert.deepEqual(await ready.json(), { ok: true });

        const publicProjects = await fetch(endpoint('/api/public-projects'));
        assert.equal(publicProjects.status, 200);
        assertCommonHeaders(publicProjects, '/api/public-projects');
        assertApiCsp(publicProjects, '/api/public-projects');
        assert.ok(Array.isArray(await publicProjects.json()));

        const page404 = await fetch(endpoint('/not-a-route'));
        assert.equal(page404.status, 404);
        assertCommonHeaders(page404, 'page 404');
        assertPageCsp(page404, 'page 404');

        const api404 = await fetch(endpoint('/api/not-a-route'));
        assert.equal(api404.status, 404);
        assertCommonHeaders(api404, 'api 404');
        assertApiCsp(api404, 'api 404');
        assert.equal((await api404.json()).error, 'Not found.');

        const unauthorized = await fetch(endpoint('/api/projects'));
        assert.equal(unauthorized.status, 401);
        assertCommonHeaders(unauthorized, 'api 401');
        assertApiCsp(unauthorized, 'api 401');

        const badOrigin = await login(
          'wrong-test-password',
          'https://unexpected.invalid',
        );
        assert.equal(badOrigin.status, 403);
        assertCommonHeaders(badOrigin, 'api 403');
        assertApiCsp(badOrigin, 'api 403');

        // Trusted origins are exact: a subdomain, a scheme change, or a
        // trailing path must not be treated as the configured origin.
        const trusted = new URL(origin);
        const alternateProtocol =
          trusted.protocol === 'https:' ? 'http:' : 'https:';
        for (const candidate of [
          `${alternateProtocol}//${trusted.host}`,
          `${trusted.protocol}//evil.${trusted.host}`,
          `${trusted.origin}/path`,
        ]) {
          const exactness = await login('wrong-test-password', candidate);
          assert.equal(
            exactness.status,
            403,
            `origin ${candidate} must be rejected`,
          );
        }

        const malformed = await fetch(endpoint('/api/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: '{',
        });
        assert.equal(malformed.status, 400);
        assertCommonHeaders(malformed, 'api 400');
        assertApiCsp(malformed, 'api 400');

        const oversized = await fetch(endpoint('/api/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ padding: 'x'.repeat(200_000) }),
        });
        assert.equal(oversized.status, 413);
        assertCommonHeaders(oversized, 'api 413');
        assertApiCsp(oversized, 'api 413');
        assert.equal((await oversized.json()).error, 'Request is too large.');
      },
    );

    await t.test(
      'login failure is generic, success verifies Argon2id, and cookie is hardened',
      async () => {
        const failure = await login('wrong-test-password');
        assert.equal(failure.status, 401);
        assert.equal(
          (await failure.json()).error,
          'Email or password is incorrect.',
        );

        const session = await authenticatedSession();
        assert.match(session.setCookie, /HttpOnly/i);
        assert.match(session.setCookie, /Secure/i);
        assert.match(session.setCookie, /SameSite=Strict/i);
        assert.match(session.setCookie, /Path=\//i);
        assert.match(session.setCookie, /Max-Age=28800/i);
        assert.equal(typeof session.csrf, 'string');
        assert.ok(session.csrf.length >= 40);

        if (db) {
          const { rows } = await db.query(
            'SELECT token_hash,csrf_hash,admin_id,created_at,last_seen_at,expires_at,revoked FROM admin_sessions ORDER BY created_at DESC LIMIT 1',
          );
          assert.equal(rows.length, 1);
          assert.notEqual(rows[0].token_hash, session.token);
          assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
          assert.match(rows[0].csrf_hash, /^[0-9a-f]{64}$/);
          assert.equal(rows[0].admin_id, adminEmail);
          assert.equal(rows[0].revoked, false);
        }

        const projects = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.equal(projects.status, 200);
        assert.equal(projects.headers.get('x-csrf-token'), session.csrf);
        assert.ok(projects.headers.get('etag'));
      },
    );

    await t.test(
      'CSRF and Origin controls reject unverified mutations',
      async () => {
        const session = await authenticatedSession();
        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const original = await current.json();

        const noCsrf = await putProjects(session.cookie, '', etag, original);
        assert.equal(noCsrf.status, 403);
        assert.equal(
          (await noCsrf.json()).error,
          'Request verification failed.',
        );

        const badOrigin = await putProjects(
          session.cookie,
          session.csrf,
          etag,
          original,
          'https://unexpected.invalid',
        );
        assert.equal(badOrigin.status, 403);
        assert.equal(
          (await badOrigin.json()).error,
          'Request origin is not allowed.',
        );

        const missingIfMatch = await fetch(endpoint('/api/projects'), {
          method: 'PUT',
          headers: {
            Cookie: session.cookie,
            Origin: origin,
            'Content-Type': 'application/json',
            'X-CSRF-Token': session.csrf,
          },
          body: JSON.stringify(original),
        });
        assert.equal(missingIfMatch.status, 428);
      },
    );

    await t.test(
      'malformed, null, oversized, and dangerous project payloads are rejected',
      async () => {
        const session = await authenticatedSession();
        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const original = await current.json();
        const valid = original[0];
        const cases = [
          null,
          [null],
          [{ ...valid, description: 'x'.repeat(5001) }],
          [{ ...valid, live: 'javascript:alert(1)' }],
          [{ ...valid, image: 'https://tracker.example/x.png' }],
          [{ ...valid, surprise: 'field' }],
          [{ ...valid, id: '../escape' }],
          [valid, { ...valid }],
          Array.from({ length: 101 }, () => valid),
        ];
        for (const body of cases) {
          const response = await putProjects(
            session.cookie,
            session.csrf,
            etag,
            body,
          );
          assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
          // A primitive JSON body is rejected by the strict body parser before
          // it reaches the route; both paths return a generic client error.
          assert.match(
            (await response.json()).error,
            /^Invalid (?:project list|request)\.$/,
          );
        }
      },
    );

    await t.test(
      'project logos upload securely, persist with the project, and are publicly served',
      async () => {
        const session = await authenticatedSession();

        const unauthenticated = await uploadImage('', session.csrf, TINY_PNG);
        assert.equal(unauthenticated.status, 401);

        const unverified = await uploadImage(session.cookie, '', TINY_PNG);
        assert.equal(unverified.status, 403);

        const badOrigin = await uploadImage(
          session.cookie,
          session.csrf,
          TINY_PNG,
          'image/png',
          'https://unexpected.invalid',
        );
        assert.equal(badOrigin.status, 403);

        const unsupported = await uploadImage(
          session.cookie,
          session.csrf,
          Buffer.from('plain text'),
          'text/plain',
        );
        assert.equal(unsupported.status, 415);

        const fakeImage = await uploadImage(
          session.cookie,
          session.csrf,
          Buffer.from('not really a png'),
          'image/png',
        );
        assert.equal(fakeImage.status, 415);

        const mismatched = await uploadImage(
          session.cookie,
          session.csrf,
          TINY_PNG,
          'image/jpeg',
        );
        assert.equal(mismatched.status, 415);

        const oversized = await uploadImage(
          session.cookie,
          session.csrf,
          Buffer.alloc(2 * 1024 * 1024 + 1, 0),
          'image/png',
        );
        assert.equal(oversized.status, 413);

        const uploaded = await uploadImage(
          session.cookie,
          session.csrf,
          TINY_PNG,
        );
        assert.equal(uploaded.status, 201);
        const image = await uploaded.json();
        assert.match(image.path, /^api\/uploads\/[0-9a-f]{32}\.png$/);
        assert.equal(image.url, `/${image.path}`);

        const served = await fetch(endpoint(`/${image.path}`));
        assert.equal(served.status, 200);
        assert.equal(served.headers.get('content-type'), 'image/png');
        assert.match(
          served.headers.get('cache-control') || '',
          /immutable/,
          'uploaded images use immutable caching',
        );
        assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(
          Buffer.from(await served.arrayBuffer()),
          TINY_PNG,
          'served image bytes match the upload',
        );

        for (const path of [
          '/api/uploads/not-a-valid-name.png',
          `/api/uploads/${'0'.repeat(32)}.png`,
          '/api/uploads/..%2Fserver.js',
        ]) {
          const missing = await fetch(endpoint(path));
          assert.equal(missing.status, 404, path);
        }

        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const before = await current.json();
        const payload = before.map((project, index) =>
          index === 0
            ? { ...project, image: image.path, imageAlt: 'Uploaded logo' }
            : project,
        );
        const updated = await putProjects(
          session.cookie,
          session.csrf,
          etag,
          payload,
        );
        assert.equal(updated.status, 200);

        const publicProjects = await fetch(endpoint('/api/public-projects'));
        assert.equal(publicProjects.status, 200);
        const publicData = await publicProjects.json();
        assert.equal(publicData[0].image, image.path);
        assert.equal(publicData[0].imageAlt, 'Uploaded logo');

        if (db) {
          const { rows } = await db.query(
            "SELECT actor,action,resource,summary FROM admin_audit WHERE action='upload' ORDER BY id DESC LIMIT 1",
          );
          assert.equal(rows.length, 1);
          assert.equal(rows[0].actor, adminEmail);
          assert.equal(rows[0].resource, 'projects');
          assert.equal(rows[0].summary.image, image.path.split('/')[2]);
          assert.equal(rows[0].summary.type, 'image/png');
          assert.equal(rows[0].summary.bytes, TINY_PNG.length);
        }

        const restored = await putProjects(
          session.cookie,
          session.csrf,
          updated.headers.get('etag'),
          before,
        );
        assert.equal(restored.status, 200);
      },
    );

    await t.test(
      'ETag concurrency rejects stale writes and failed writes do not mutate data',
      async () => {
        const session = await authenticatedSession();
        const first = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag1 = first.headers.get('etag');
        const original = await first.json();
        assert.ok(etag1);

        const updatedPayload = original.map((project, index) =>
          index === 0
            ? { ...project, title: `${project.title} (integration update)` }
            : project,
        );
        const updated = await putProjects(
          session.cookie,
          session.csrf,
          etag1,
          updatedPayload,
        );
        assert.equal(updated.status, 200);
        const etag2 = updated.headers.get('etag');
        assert.ok(etag2 && etag2 !== etag1);

        let auditBefore = 0;
        if (db) {
          const result = await db.query(
            "SELECT count(*)::int AS count FROM admin_audit WHERE resource='projects'",
          );
          auditBefore = result.rows[0].count;
        }

        const stale = await putProjects(
          session.cookie,
          session.csrf,
          etag1,
          original,
        );
        assert.equal(stale.status, 409);
        assert.match((await stale.json()).error, /changed in another session/i);

        if (db) {
          const result = await db.query(
            "SELECT count(*)::int AS count FROM admin_audit WHERE resource='projects'",
          );
          assert.equal(result.rows[0].count, auditBefore);
        }

        const afterStale = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.equal(afterStale.headers.get('etag'), etag2);
        const afterStaleData = await afterStale.json();
        assert.equal(afterStaleData[0].title, updatedPayload[0].title);

        const failedWrite = await putProjects(
          session.cookie,
          session.csrf,
          etag2,
          [{ ...afterStaleData[0], live: 'javascript:alert(1)' }],
        );
        assert.equal(failedWrite.status, 400);

        const afterFailure = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.equal(afterFailure.headers.get('etag'), etag2);
        assert.deepEqual(await afterFailure.json(), afterStaleData);

        const restored = await putProjects(
          session.cookie,
          session.csrf,
          etag2,
          original,
        );
        assert.equal(restored.status, 200);
        assert.notEqual(restored.headers.get('etag'), etag2);

        if (db) {
          const { rows } = await db.query(
            "SELECT request_id,session_ref,actor,action,resource,summary FROM admin_audit WHERE resource='projects' ORDER BY id DESC LIMIT 1",
          );
          assert.equal(rows.length, 1);
          assert.equal(rows[0].actor, adminEmail);
          assert.equal(rows[0].action, 'replace');
          assert.equal(rows[0].resource, 'projects');
          assert.match(rows[0].session_ref, /^[0-9a-f]{64}$/);
          assert.notEqual(rows[0].session_ref, session.token);
          assert.equal(typeof rows[0].summary.count, 'number');
        }
      },
    );

    await t.test(
      'reorder persists to sort_order, returns a new ETag, and is public',
      async () => {
        const session = await authenticatedSession();
        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const before = await current.json();
        assert.ok(before.length >= 2, 'seed contains multiple projects');

        const reordered = before.slice().reverse();
        const updated = await putProjects(
          session.cookie,
          session.csrf,
          etag,
          reordered,
        );
        assert.equal(updated.status, 200);
        const updatedTag = updated.headers.get('etag');
        assert.ok(updatedTag && updatedTag !== etag);

        const after = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.equal(after.headers.get('etag'), updatedTag);
        const afterProjects = await after.json();
        assert.deepEqual(
          afterProjects.map((project) => project.id),
          reordered.map((project) => project.id),
        );

        const publicAfter = await fetch(endpoint('/api/public-projects'));
        assert.equal(publicAfter.status, 200);
        const publicProjects = await publicAfter.json();
        assert.deepEqual(
          publicProjects.map((project) => project.id),
          reordered.map((project) => project.id),
        );

        if (db) {
          const { rows } = await db.query(
            "SELECT actor,action,resource,summary,request_id FROM admin_audit WHERE resource='projects' ORDER BY id DESC LIMIT 1",
          );
          assert.equal(rows.length, 1);
          assert.equal(rows[0].actor, adminEmail);
          assert.equal(rows[0].action, 'replace');
          assert.equal(rows[0].summary.count, reordered.length);
          assert.ok(rows[0].request_id);
          assert.doesNotMatch(JSON.stringify(rows[0]), /dev_session|csrf/i);
        }

        const restored = await putProjects(
          session.cookie,
          session.csrf,
          updatedTag,
          before,
        );
        assert.equal(restored.status, 200);
        assert.notEqual(restored.headers.get('etag'), updatedTag);
      },
    );

    await t.test(
      'duplicate IDs and malformed IDs reject the whole reorder without mutation',
      async () => {
        const session = await authenticatedSession();
        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const before = await current.json();
        const originalIds = before.map((project) => project.id);

        const duplicate = await putProjects(
          session.cookie,
          session.csrf,
          etag,
          [before[0], { ...before[0] }],
        );
        assert.equal(duplicate.status, 400);

        const malformed = await putProjects(
          session.cookie,
          session.csrf,
          etag,
          [{ ...before[0], id: '../escape' }, ...before.slice(1)],
        );
        assert.equal(malformed.status, 400);

        const after = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.equal(after.headers.get('etag'), etag);
        assert.deepEqual(
          (await after.json()).map((project) => project.id),
          originalIds,
        );
      },
    );

    await t.test(
      'a simulated database failure rolls back the previous order',
      async () => {
        if (!db) return;
        const session = await authenticatedSession();
        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const before = await current.json();
        assert.ok(before.length);
        try {
          await db.query(
            "CREATE OR REPLACE FUNCTION portfolio_test_fail_insert() RETURNS trigger AS $$ BEGIN IF NEW.id = 'rollback-test' THEN RAISE EXCEPTION 'simulated write failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql",
          );
          await db.query(
            'DROP TRIGGER IF EXISTS portfolio_test_fail_insert ON projects',
          );
          await db.query(
            'CREATE TRIGGER portfolio_test_fail_insert BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION portfolio_test_fail_insert()',
          );
          const payload = before.map((project, index) =>
            index === 0 ? { ...project, id: 'rollback-test' } : project,
          );
          const failed = await putProjects(
            session.cookie,
            session.csrf,
            etag,
            payload,
          );
          assert.equal(failed.status, 500);
          const after = await fetch(endpoint('/api/projects'), {
            headers: { Cookie: session.cookie },
          });
          assert.equal(after.headers.get('etag'), etag);
          assert.deepEqual(await after.json(), before);
        } finally {
          await db.query(
            'DROP TRIGGER IF EXISTS portfolio_test_fail_insert ON projects',
          );
          await db.query(
            'DROP FUNCTION IF EXISTS portfolio_test_fail_insert()',
          );
        }
      },
    );

    await t.test(
      'empty and single-item collections reorder and render correctly',
      async () => {
        const session = await authenticatedSession();
        const current = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const etag = current.headers.get('etag');
        const before = await current.json();
        assert.ok(before.length, 'seed contains projects');

        const emptied = await putProjects(
          session.cookie,
          session.csrf,
          etag,
          [],
        );
        assert.equal(emptied.status, 200);
        const emptyTag = emptied.headers.get('etag');
        assert.ok(emptyTag && emptyTag !== etag);
        const emptyAdmin = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.deepEqual(await emptyAdmin.json(), []);
        assert.deepEqual(
          await (await fetch(endpoint('/api/public-projects'))).json(),
          [],
        );

        const single = await putProjects(
          session.cookie,
          session.csrf,
          emptyTag,
          [before[0]],
        );
        assert.equal(single.status, 200);
        const singleTag = single.headers.get('etag');
        const singleAdmin = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        const singleProjects = await singleAdmin.json();
        assert.equal(singleProjects.length, 1);
        assert.equal(singleProjects[0].id, before[0].id);
        const singlePublic = await fetch(endpoint('/api/public-projects'));
        assert.deepEqual(
          (await singlePublic.json()).map((project) => project.id),
          [before[0].id],
        );

        const restored = await putProjects(
          session.cookie,
          session.csrf,
          singleTag,
          before,
        );
        assert.equal(restored.status, 200);
      },
    );

    await t.test(
      'idle, absolute, and explicit expiry reject server-side sessions',
      async () => {
        if (!db) return;

        const idle = await authenticatedSession();
        await db.query(
          "UPDATE admin_sessions SET last_seen_at=now()-interval '31 minutes' WHERE token_hash=$1",
          [tokenHash(idle.token)],
        );
        const idleResponse = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: idle.cookie },
        });
        assert.equal(idleResponse.status, 401);

        const absolute = await authenticatedSession();
        await db.query(
          "UPDATE admin_sessions SET created_at=now()-interval '9 hours',last_seen_at=now() WHERE token_hash=$1",
          [tokenHash(absolute.token)],
        );
        const absoluteResponse = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: absolute.cookie },
        });
        assert.equal(absoluteResponse.status, 401);

        const expired = await authenticatedSession();
        await db.query(
          "UPDATE admin_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
          [tokenHash(expired.token)],
        );
        const expiredResponse = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: expired.cookie },
        });
        assert.equal(expiredResponse.status, 401);
      },
    );

    await t.test(
      'logout revokes the server-side session and the revoked cookie is rejected',
      async () => {
        const session = await authenticatedSession();
        const logout = await fetch(endpoint('/api/logout'), {
          method: 'POST',
          headers: {
            Cookie: session.cookie,
            Origin: origin,
            'X-CSRF-Token': session.csrf,
          },
        });
        assert.equal(logout.status, 200);
        assert.match(
          logout.headers.get('set-cookie') || '',
          /dev_session=;|Max-Age=0/i,
        );

        const revoked = await fetch(endpoint('/api/projects'), {
          headers: { Cookie: session.cookie },
        });
        assert.equal(revoked.status, 401);

        if (db) {
          const { rows } = await db.query(
            'SELECT revoked FROM admin_sessions ORDER BY created_at DESC LIMIT 1',
          );
          assert.equal(rows[0].revoked, true);
        }
      },
    );

    await t.test(
      'login rate limiting blocks repeated failures without leaking details',
      async () => {
        if (db) await db.query('DELETE FROM login_attempts');
        for (let attempt = 0; attempt < 10; attempt++) {
          const denied = await login('wrong-test-password');
          assert.equal(denied.status, 401);
          const data = await denied.json();
          assert.equal(data.error, 'Email or password is incorrect.');
          assert.doesNotMatch(JSON.stringify(data), /wrong-test-password/);
        }
        const limited = await login('wrong-test-password');
        assert.equal(limited.status, 429);
        const data = await limited.json();
        assert.equal(data.error, 'Too many sign-in attempts. Try again later.');
        assert.doesNotMatch(JSON.stringify(data), /wrong-test-password/);
      },
    );
  },
);
