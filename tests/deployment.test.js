import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_LISTEN_HOST,
  resolveApiPort,
  resolveUploadsDir,
} from '../lib/runtime.js';
import {
  apiRewriteDestination,
  assertDatabaseUrlCompatibility,
  hasRequiredSslMode,
  isLocalhostHostname,
  isNeonPooledUrl,
  normalizeBaseUrl,
  resolveApiDestination,
} from '../lib/deployment.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Render PORT takes precedence over API_PORT and the local default', () => {
  assert.equal(resolveApiPort({ PORT: '10000', API_PORT: '4000' }), 10000);
  assert.equal(resolveApiPort({ PORT: '10000' }), 10000);
  assert.equal(resolveApiPort({ API_PORT: '4000' }), 4000);
  assert.equal(resolveApiPort({}), 4000);
});

test('API port rejects invalid values instead of silently defaulting', () => {
  for (const value of ['0', '-1', '1.5', 'abc', '65536', ' '])
    assert.throws(() => resolveApiPort({ PORT: value }), /port/i);
});

test('the API always binds to 0.0.0.0 for Render and containers', () => {
  assert.equal(API_LISTEN_HOST, '0.0.0.0');
  assert.match(read('server.js'), /app\.listen\(port, API_LISTEN_HOST/);
  assert.match(read('server.js'), /resolveApiPort\(process\.env\)/);
});

test('upload directory defaults locally and accepts an absolute override', () => {
  assert.equal(resolveUploadsDir({}, '/srv/app'), '/srv/app/uploads');
  assert.equal(
    resolveUploadsDir({ UPLOAD_DIR: '/var/data/uploads' }, '/srv/app'),
    '/var/data/uploads',
  );
  assert.equal(
    resolveUploadsDir({ UPLOAD_DIR: 'uploads' }, '/srv/app'),
    '/srv/app/uploads',
  );
});

test('localhost hostnames are recognized in every common spelling', () => {
  for (const host of [
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
  ])
    assert.equal(isLocalhostHostname(host), true, host);
  assert.equal(isLocalhostHostname('api.example.com'), false);
});

test('base URLs are normalized without a trailing slash', () => {
  assert.equal(
    normalizeBaseUrl('https://api.example.com/'),
    'https://api.example.com',
  );
  assert.equal(
    normalizeBaseUrl('https://api.example.com'),
    'https://api.example.com',
  );
  assert.equal(
    normalizeBaseUrl('', 'http://localhost:4000'),
    'http://localhost:4000',
  );
});

test('Neon pooled hostnames are detected', () => {
  assert.equal(
    isNeonPooledUrl(
      'postgresql://u:p@ep-example-pooler.us-east-2.aws.neon.tech/db',
    ),
    true,
  );
  assert.equal(
    isNeonPooledUrl('postgresql://u:p@ep-example.us-east-2.aws.neon.tech/db'),
    false,
  );
  assert.equal(isNeonPooledUrl('not a url'), false);
});

test('TLS sslmode is required and detected', () => {
  assert.equal(
    hasRequiredSslMode(
      'postgresql://u:p@ep-example.us-east-2.aws.neon.tech/db?sslmode=require',
    ),
    true,
  );
  assert.equal(
    hasRequiredSslMode(
      'postgresql://u:p@ep-example.us-east-2.aws.neon.tech/db?sslmode=verify-full',
    ),
    true,
  );
  assert.equal(
    hasRequiredSslMode(
      'postgresql://u:p@ep-example.us-east-2.aws.neon.tech/db',
    ),
    false,
  );
});

test('database URL compatibility rejects poolers and insecure production URLs', () => {
  const direct =
    'postgresql://u:p@ep-example.us-east-2.aws.neon.tech/db?sslmode=require';
  assert.doesNotThrow(() =>
    assertDatabaseUrlCompatibility(direct, { production: true }),
  );
  assert.doesNotThrow(() =>
    assertDatabaseUrlCompatibility('', { production: true }),
  );
  assert.throws(
    () =>
      assertDatabaseUrlCompatibility(
        'postgresql://u:p@ep-example-pooler.us-east-2.aws.neon.tech/db?sslmode=require',
        { production: true },
      ),
    /direct Neon connection/i,
  );
  assert.throws(
    () =>
      assertDatabaseUrlCompatibility(
        'postgresql://u:p@ep-example.us-east-2.aws.neon.tech/db',
        { production: true },
      ),
    /sslmode=require/i,
  );
  assert.throws(
    () => assertDatabaseUrlCompatibility('mysql://u:p@host/db'),
    /postgres/i,
  );
});

test('Vercel rewrite destinations have no trailing slash before /api', () => {
  const env = {
    VERCEL: '1',
    NODE_ENV: 'production',
    API_INTERNAL_URL: 'https://portfolio-api.onrender.com/',
  };
  assert.equal(
    resolveApiDestination(env),
    'https://portfolio-api.onrender.com',
  );
  assert.equal(
    apiRewriteDestination(env),
    'https://portfolio-api.onrender.com/api/:path*',
  );
});

test('Vercel production rejects missing, HTTP, local, or pathed API URLs', () => {
  const base = { VERCEL: '1', NODE_ENV: 'production' };
  assert.throws(
    () => resolveApiDestination(base),
    /API_INTERNAL_URL is required/,
  );
  assert.throws(
    () =>
      resolveApiDestination({
        ...base,
        API_INTERNAL_URL: 'http://api.example',
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      resolveApiDestination({
        ...base,
        API_INTERNAL_URL: 'https://localhost:4000',
      }),
    /localhost/,
  );
  assert.throws(
    () =>
      resolveApiDestination({
        ...base,
        API_INTERNAL_URL: 'https://api.example/prefix',
      }),
    /origin without a path/,
  );
});

test('Docker builds keep the internal API URL fallback', () => {
  assert.equal(
    resolveApiDestination({ API_INTERNAL_URL: 'http://api:4000' }),
    'http://api:4000',
  );
  assert.equal(resolveApiDestination({}), 'http://localhost:4000');
});

test('next.config.mjs uses the shared rewrite helper and no public API URL', () => {
  const nextConfig = read('next.config.mjs');
  assert.match(nextConfig, /apiRewriteDestination\(process\.env\)/);
  assert.doesNotMatch(nextConfig, /NEXT_PUBLIC_API_URL\s*=/);
});

test('browser code uses relative /api paths and no Render API origin', () => {
  for (const file of ['js/admin.js', 'js/projects.js']) {
    const source = read(file);
    assert.match(source, /['"]\/api\//);
    assert.doesNotMatch(source, /https?:\/\/[^\s'"]*onrender\.com/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_API_URL/);
  }
});

test('the API image does not bake in PORT and points uploads at /app/uploads', () => {
  const dockerfile = read('Dockerfile');
  assert.doesNotMatch(dockerfile, /^ENV PORT=/m);
  assert.match(dockerfile, /^ENV UPLOAD_DIR=\/app\/uploads$/m);
});

test('documentation covers the Render, Neon, and Vercel topology', () => {
  for (const file of ['README.md', 'docs/security.md']) {
    const document = read(file);
    assert.match(document, /Render/);
    assert.match(document, /Neon/);
    assert.match(document, /Vercel/);
    assert.match(document, /API_INTERNAL_URL/);
    assert.match(document, /sslmode=require/);
    assert.match(document, /persistent disk|persistent volume|persistent/i);
    assert.match(document, /\/api\/ready/);
    assert.match(document, /npm run api/);
  }
});

test('documentation never contains a real credential or wildcard origin', () => {
  for (const file of ['README.md', 'docs/security.md', '.env.example']) {
    const document = read(file);
    assert.doesNotMatch(
      document,
      /postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@/,
      `${file} contains a database URL with credentials`,
    );
    assert.doesNotMatch(document, /https:\/\/\*\.vercel\.app/);
    assert.doesNotMatch(document, /NEXT_PUBLIC_API_URL\s*=/);
  }
});
