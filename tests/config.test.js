import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import argon2 from 'argon2';
import {
  isStrongArgon2idHash,
  isStrongDatabasePassword,
  isStrongSessionSecret,
  parseTrustProxyHops,
  resolveConfig,
} from '../lib/config.js';

const passwordHash = await argon2.hash('test-only configuration fixture', {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const sessionSecret = crypto.randomBytes(48).toString('base64url');
const databasePassword = crypto.randomBytes(32).toString('base64url');

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    HTTPS_TERMINATED: 'true',
    TRUSTED_ORIGINS: 'https://portfolio.example',
    ADMIN_EMAIL: 'admin@portfolio.example',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: sessionSecret,
    PGPASSWORD: databasePassword,
    TRUST_PROXY_HOPS: '1',
    UPLOAD_DIR: '/var/data/uploads',
    ...overrides,
  };
}

const directNeonUrl =
  'postgresql://portfolio:not-a-real-password@ep-example.us-east-2.aws.neon.tech/portfolio?sslmode=require';

test('NODE_ENV=production with omitted APP_ENV enters production mode', () => {
  const env = productionEnv();
  delete env.APP_ENV;
  const config = resolveConfig(env);
  assert.equal(config.production, true);
  assert.equal(config.secureCookies, true);
  assert.equal(config.trustProxyHops, 1);
});

test('NODE_ENV=production with omitted APP_ENV rejects insecure settings', () => {
  const env = productionEnv({
    HTTPS_TERMINATED: 'false',
    TRUSTED_ORIGINS: 'http://localhost:3000',
    ADMIN_PASSWORD_HASH: 'plaintext',
    SESSION_SECRET: 'short',
    PGPASSWORD: 'short',
  });
  delete env.APP_ENV;
  assert.throws(() => resolveConfig(env), /configuration is invalid/i);
});

test('APP_ENV=development cannot downgrade NODE_ENV=production', () => {
  assert.throws(
    () => resolveConfig(productionEnv({ APP_ENV: 'development' })),
    /configuration is invalid/i,
  );
});

test('APP_ENV=production with NODE_ENV=development is contradictory', () => {
  assert.throws(
    () => resolveConfig(productionEnv({ NODE_ENV: 'development' })),
    /configuration is invalid/i,
  );
});

test('unknown environment values fail closed', () => {
  assert.throws(
    () => resolveConfig(productionEnv({ NODE_ENV: 'prod' })),
    /configuration is invalid/i,
  );
  assert.throws(
    () => resolveConfig(productionEnv({ APP_ENV: 'staging' })),
    /configuration is invalid/i,
  );
});

test('production rejects weak or malformed security settings', () => {
  const cases = [
    { HTTPS_TERMINATED: 'false' },
    { TRUSTED_ORIGINS: '' },
    { TRUSTED_ORIGINS: 'http://portfolio.example' },
    { TRUSTED_ORIGINS: 'https://portfolio.example/path' },
    { TRUSTED_ORIGINS: 'https://localhost:3000' },
    { ADMIN_EMAIL: '' },
    { ADMIN_EMAIL: 'not-an-email' },
    { ADMIN_PASSWORD_HASH: '' },
    { ADMIN_PASSWORD_HASH: 'plaintext' },
    { SESSION_SECRET: 'short' },
    { SESSION_SECRET: 'A'.repeat(64) },
    {
      SESSION_SECRET: 'dev-only-session-secret-do-not-use-in-production-0001',
    },
    { PGPASSWORD: 'short' },
    { PGPASSWORD: 'change-this-password-now-please' },
    { PGPASSWORD: 'dev-only-postgres-password-do-not-use-0001' },
    { UPLOAD_DIR: '' },
    { UPLOAD_DIR: 'relative/uploads' },
    { TRUSTED_ORIGINS: 'https://0.0.0.0' },
    { TRUSTED_ORIGINS: 'https://[::1]' },
    { TRUSTED_ORIGINS: 'https://*.vercel.app' },
  ];
  for (const overrides of cases)
    assert.throws(
      () => resolveConfig(productionEnv(overrides)),
      /configuration is invalid/i,
    );
});

test('production returns the absolute upload directory', () => {
  const config = resolveConfig(
    productionEnv({ UPLOAD_DIR: '/var/data/uploads' }),
  );
  assert.equal(config.uploadDir, '/var/data/uploads');
  assert.equal(config.renderHosted, false);
});

test('production accepts a direct Neon URL that requires TLS', () => {
  const config = resolveConfig(productionEnv({ DATABASE_URL: directNeonUrl }));
  assert.equal(config.production, true);
});

test('production rejects pooled Neon URLs for advisory-lock migrations', () => {
  assert.throws(
    () =>
      resolveConfig(
        productionEnv({
          DATABASE_URL:
            'postgresql://portfolio:not-a-real-password@ep-example-pooler.us-east-2.aws.neon.tech/portfolio?sslmode=require',
        }),
      ),
    /configuration is invalid/i,
  );
});

test('production rejects a Neon URL without sslmode=require', () => {
  assert.throws(
    () =>
      resolveConfig(
        productionEnv({
          DATABASE_URL:
            'postgresql://portfolio:not-a-real-password@ep-example.us-east-2.aws.neon.tech/portfolio',
        }),
      ),
    /configuration is invalid/i,
  );
});

test('Render mode requires production mode and a managed DATABASE_URL', () => {
  assert.throws(
    () => resolveConfig(productionEnv({ RENDER: 'true' })),
    /configuration is invalid/i,
  );
  const config = resolveConfig(
    productionEnv({ RENDER: 'true', DATABASE_URL: directNeonUrl }),
  );
  assert.equal(config.renderHosted, true);
});

test('production trusted origins are exact HTTPS origins', () => {
  const config = resolveConfig(
    productionEnv({
      TRUSTED_ORIGINS:
        'https://portfolio.example, https://www.portfolio.example/',
    }),
  );
  assert.deepEqual(config.allowedOrigins, [
    'https://portfolio.example',
    'https://www.portfolio.example',
  ]);
});

test('explicit development profile allows HTTP localhost and insecure cookies', () => {
  const config = resolveConfig({
    NODE_ENV: 'development',
    APP_ENV: 'development',
    HTTPS_TERMINATED: 'false',
    TRUSTED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    ADMIN_EMAIL: 'admin@example.invalid',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: sessionSecret,
    PGPASSWORD: databasePassword,
    TRUST_PROXY_HOPS: '0',
  });
  assert.equal(config.production, false);
  assert.equal(config.secureCookies, false);
  assert.deepEqual(config.allowedOrigins, [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
});

test('development with HTTPS termination marks cookies secure', () => {
  const config = resolveConfig({
    NODE_ENV: 'development',
    APP_ENV: 'development',
    HTTPS_TERMINATED: 'true',
    TRUSTED_ORIGINS: 'http://localhost:3000',
    TRUST_PROXY_HOPS: '0',
  });
  assert.equal(config.production, false);
  assert.equal(config.secureCookies, true);
});

test('TRUST_PROXY_HOPS is a bounded non-negative integer', () => {
  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops(''), 0);
  assert.equal(parseTrustProxyHops('0'), 0);
  assert.equal(parseTrustProxyHops('10'), 10);
  assert.equal(parseTrustProxyHops(' 2 '), 2);
  for (const value of ['-1', '1.5', 'abc', '11', '999', '1e2'])
    assert.throws(
      () => parseTrustProxyHops(value),
      /configuration is invalid/i,
    );
});

test('Argon2id strength check rejects weak parameters', () => {
  assert.equal(isStrongArgon2idHash(passwordHash), true);
  assert.equal(
    isStrongArgon2idHash('$argon2id$v=19$m=1024,t=2,p=1$c2FsdA$aGFzaA'),
    false,
  );
  assert.equal(
    isStrongArgon2idHash('$argon2i$v=19$m=19456,t=2,p=1$x$y'),
    false,
  );
});

test('development fallback credentials are rejected by production checks', () => {
  assert.equal(
    isStrongSessionSecret(
      'dev-only-session-secret-do-not-use-in-production-0001',
    ),
    false,
  );
  assert.equal(
    isStrongDatabasePassword('dev-only-postgres-password-do-not-use-0001'),
    false,
  );
});

test('server startup fails closed with a generic error and no secret values', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    encoding: 'utf8',
    env: {
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'admin@example.invalid',
      ADMIN_PASSWORD_HASH: '',
      SESSION_SECRET: 'do-not-print-this-secret',
      TRUSTED_ORIGINS: '',
      HTTPS_TERMINATED: 'false',
      PGPASSWORD: 'do-not-print-this-database-password',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configuration_error/);
  assert.doesNotMatch(result.stderr, /do-not-print|password=|secret=/i);
  assert.doesNotMatch(result.stderr, /at .*server\.js/);
});
