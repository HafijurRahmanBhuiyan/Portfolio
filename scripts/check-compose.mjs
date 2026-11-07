import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { resolveConfig } from '../lib/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-compose-'));
// Remove generated test credentials even when process.exit() is used.
process.on('exit', () => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});
const adminPassword = `test-only-${crypto.randomBytes(24).toString('base64url')}`;
const adminPasswordHash = await argon2.hash(adminPassword, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const databasePassword = crypto.randomBytes(32).toString('base64url');
const sessionSecret = crypto.randomBytes(48).toString('base64url');
const actionKey = crypto.randomBytes(32).toString('base64');
const secrets = [
  adminPassword,
  adminPasswordHash,
  databasePassword,
  sessionSecret,
  actionKey,
];

const baseEnv = Object.fromEntries(
  Object.entries({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DOCKER_CONFIG: process.env.DOCKER_CONFIG,
    DOCKER_HOST: process.env.DOCKER_HOST,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  }).filter(([, value]) => value !== undefined),
);

function redact(text) {
  let result = String(text || '');
  for (const secret of secrets)
    if (secret) result = result.split(secret).join('[redacted]');
  return result;
}

function envFile(name, values) {
  const file = path.join(tempDir, `${name}.env`);
  // Compose interpolates '$' in --env-file values, so escape it. Generated
  // Argon2 hashes contain '$' and must reach the validator unchanged.
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}=${String(value).split('$').join('$$')}`,
  );
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  return file;
}

function composeConfig(file, envPath) {
  return spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      envPath,
      '-f',
      file,
      'config',
      '--format',
      'json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: baseEnv,
    },
  );
}

function parse(result, name) {
  if (result.status !== 0)
    throw new Error(
      `${name}: docker compose config failed (exit ${result.status}): ${redact(result.stderr).trim().slice(0, 300)}`,
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${name}: docker compose config returned invalid JSON`);
  }
}

function apiEnvironment(config) {
  const environment = config.services.api.environment;
  // `docker compose config` renders an escaped literal dollar as `$$`.
  // Container runtime receives `$`, so normalize before validation.
  return Object.fromEntries(
    Object.entries(environment).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.replace(/\$\$/g, '$') : value,
    ]),
  );
}

function assertNoLeak(result, name) {
  const output = `${result.stdout}\n${result.stderr}`;
  for (const secret of secrets)
    if (secret && output.includes(secret))
      throw new Error(`${name}: compose output contained a generated secret`);
}

const productionValues = {
  POSTGRES_PASSWORD: databasePassword,
  ADMIN_EMAIL: 'admin@portfolio.example',
  ADMIN_PASSWORD_HASH: adminPasswordHash,
  SESSION_SECRET: sessionSecret,
  TRUSTED_ORIGINS: 'https://portfolio.example',
  TRUST_PROXY_HOPS: '1',
  HTTPS_TERMINATED: 'true',
  APP_ENV: 'production',
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: actionKey,
};

const developmentValues = {
  ADMIN_PASSWORD_HASH: adminPasswordHash,
};

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}: ${redact(error.message)}`);
  }
}

function expectMissing(name, values) {
  check(name, () => {
    const result = composeConfig(
      'docker-compose.yml',
      envFile(name.replace(/\W+/g, '-'), values),
    );
    assertNoLeak(result, name);
    if (result.status === 0)
      throw new Error(`${name}: expected configuration to fail`);
  });
}

function expectResolveFailure(name, values) {
  check(name, () => {
    const config = parse(
      composeConfig(
        'docker-compose.yml',
        envFile(name.replace(/\W+/g, '-'), values),
      ),
      name,
    );
    try {
      resolveConfig(apiEnvironment(config));
    } catch {
      return;
    }
    throw new Error(`${name}: expected runtime validation to reject config`);
  });
}

try {
  const docker = spawnSync('docker', ['info'], {
    cwd: root,
    encoding: 'utf8',
    env: baseEnv,
  });
  if (docker.status !== 0) {
    if (process.env.REQUIRE_COMPOSE_CHECK === '1')
      throw new Error('Docker is required for Compose validation.');
    console.log('SKIP - Docker is unavailable; Compose checks were not run.');
    process.exit(0);
  }

  let developmentConfig;
  let productionConfig;

  check('development Compose resolves with a valid Argon2id hash', () => {
    const result = composeConfig(
      'docker-compose.dev.yml',
      envFile('dev-valid', developmentValues),
    );
    developmentConfig = parse(result, 'development Compose');
    const resolved = resolveConfig(apiEnvironment(developmentConfig));
    if (resolved.production !== false)
      throw new Error('development Compose unexpectedly entered production');
    if (resolved.httpsTerminated !== false)
      throw new Error('development Compose unexpectedly enabled HTTPS');
    if (
      JSON.stringify(resolved.allowedOrigins) !==
      JSON.stringify(['http://localhost:3000', 'http://127.0.0.1:3000'])
    )
      throw new Error('development Compose origins are not localhost HTTP');
    if (!developmentConfig.services.db)
      throw new Error('development Compose has no db service');
    if (
      developmentConfig.services.db.ports &&
      developmentConfig.services.db.ports.length
    )
      throw new Error('development Compose publishes the database port');
  });

  check('production Compose resolves with complete settings', () => {
    const result = composeConfig(
      'docker-compose.yml',
      envFile('prod-valid', productionValues),
    );
    productionConfig = parse(result, 'production Compose');
    const environment = apiEnvironment(productionConfig);
    const resolved = resolveConfig(environment);
    if (resolved.production !== true)
      throw new Error('production Compose did not enter production mode');
    if (resolved.httpsTerminated !== true)
      throw new Error('production Compose did not require HTTPS termination');
    if (resolved.uploadDir !== '/app/uploads')
      throw new Error('production Compose does not mount /app/uploads');
    // Render injects PORT. The Compose API must keep using API_PORT so a
    // baked-in PORT cannot redirect the API away from the internal network.
    if (Object.hasOwn(environment, 'PORT'))
      throw new Error('production Compose must not set PORT for the API');
  });

  check('development and production volume names differ', () => {
    const devVolumes = Object.keys(developmentConfig.volumes || {});
    const prodVolumes = Object.keys(productionConfig.volumes || {});
    if (!devVolumes.length || !prodVolumes.length)
      throw new Error('Compose volume names were not resolved');
    if (devVolumes.some((volume) => prodVolumes.includes(volume)))
      throw new Error('development and production share a volume name');
  });

  for (const variable of [
    'ADMIN_PASSWORD_HASH',
    'HTTPS_TERMINATED',
    'TRUSTED_ORIGINS',
    'APP_ENV',
    'TRUST_PROXY_HOPS',
    'POSTGRES_PASSWORD',
    'SESSION_SECRET',
    'ADMIN_EMAIL',
  ]) {
    const values = { ...productionValues };
    delete values[variable];
    expectMissing(
      `production Compose fails when ${variable} is missing`,
      values,
    );
  }

  expectResolveFailure('production rejects HTTPS_TERMINATED=false', {
    ...productionValues,
    HTTPS_TERMINATED: 'false',
  });
  expectResolveFailure('production rejects an HTTP trusted origin', {
    ...productionValues,
    TRUSTED_ORIGINS: 'http://portfolio.example',
  });
  expectResolveFailure('production rejects a localhost trusted origin', {
    ...productionValues,
    TRUSTED_ORIGINS: 'https://localhost:3000',
  });
  expectResolveFailure('production rejects APP_ENV downgrade', {
    ...productionValues,
    APP_ENV: 'development',
  });
  expectResolveFailure('production rejects the development session fallback', {
    ...productionValues,
    SESSION_SECRET: 'dev-only-session-secret-do-not-use-in-production-0001',
  });
  expectResolveFailure('production rejects the development database fallback', {
    ...productionValues,
    POSTGRES_PASSWORD: 'dev-only-postgres-password-do-not-use-0001',
  });

  check('production rejects a pooled Neon DATABASE_URL', () => {
    const environment = {
      ...apiEnvironment(productionConfig),
      DATABASE_URL:
        'postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/portfolio?sslmode=require',
    };
    try {
      resolveConfig(environment);
    } catch {
      return;
    }
    throw new Error('pooled Neon DATABASE_URL was accepted');
  });

  check('production requires sslmode=require in DATABASE_URL', () => {
    const environment = {
      ...apiEnvironment(productionConfig),
      DATABASE_URL:
        'postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/portfolio',
    };
    try {
      resolveConfig(environment);
    } catch {
      return;
    }
    throw new Error('DATABASE_URL without TLS was accepted');
  });

  check('Render mode requires production and a managed DATABASE_URL', () => {
    const environment = { ...apiEnvironment(productionConfig), RENDER: 'true' };
    try {
      resolveConfig(environment);
    } catch {
      return;
    }
    throw new Error('Render mode was accepted without DATABASE_URL');
  });

  console.log(
    `Compose validation: ${passed} passed, ${failed} failed. No secret values were printed.`,
  );
  process.exit(failed ? 1 : 0);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
