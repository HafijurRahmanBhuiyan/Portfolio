import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (!['integration', 'browser', 'smoke', 'dev'].includes(mode)) {
  console.error(
    'Usage: node scripts/test-stack.mjs <integration|browser|smoke|dev>',
  );
  process.exit(2);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: options.env || process.env,
      stdio: options.inherit ? 'inherit' : 'pipe',
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (chunk) => (stdout += chunk));
    if (child.stderr) child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitFor(url, expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.status === expected) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.name || 'network error';
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `Timed out waiting for ${url} to return ${expected}: ${lastError}`,
  );
}

const adminEmail = 'admin@test.invalid';
const adminPassword = `test-only-${randomSecret(24)}`;
const databasePassword = randomSecret(32);
const sessionSecret = randomSecret(48);
const actionKey = crypto.randomBytes(32).toString('base64');
const adminPasswordHash = await argon2.hash(adminPassword, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const [dbPort, apiPort, webPort] = await Promise.all([
  freePort(),
  freePort(),
  freePort(),
]);
const project = `portfolio-${mode}-${process.pid}`;
const envFile = path.join(
  os.tmpdir(),
  `${project}-${crypto.randomBytes(8).toString('hex')}.env`,
);
const productionMode = mode === 'integration' || mode === 'smoke';
const devMode = mode === 'dev';
const origin = productionMode
  ? 'https://portfolio.test'
  : `http://127.0.0.1:${webPort}`;

// The dev check uses the real development Compose file, but replaces its
// named database volume with tmpfs so verification never touches or deletes a
// user's development data.
const overrideFile = devMode
  ? path.join(
      os.tmpdir(),
      `${project}-${crypto.randomBytes(8).toString('hex')}.yml`,
    )
  : null;
if (overrideFile)
  fs.writeFileSync(
    overrideFile,
    [
      'services:',
      '  db:',
      '    volumes: !reset []',
      '    tmpfs:',
      '      - /var/lib/postgresql/data',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );

const values = devMode
  ? {
      PORT: String(webPort),
      POSTGRES_PASSWORD: databasePassword,
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_HASH: adminPasswordHash,
      SESSION_SECRET: sessionSecret,
      TRUSTED_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: actionKey,
    }
  : {
      TEST_DB_PORT: String(dbPort),
      TEST_API_PORT: String(apiPort),
      TEST_WEB_PORT: String(webPort),
      TEST_POSTGRES_PASSWORD: databasePassword,
      TEST_ADMIN_EMAIL: adminEmail,
      TEST_ADMIN_PASSWORD_HASH: adminPasswordHash,
      TEST_SESSION_SECRET: sessionSecret,
      TEST_ACTION_KEY: actionKey,
      TEST_TRUSTED_ORIGINS: origin,
      TEST_NODE_ENV: productionMode ? 'production' : 'development',
      TEST_APP_ENV: productionMode ? 'production' : 'development',
      TEST_HTTPS_TERMINATED: productionMode ? 'true' : 'false',
    };
// Compose interpolates `$` in --env-file values. Escape it so generated
// Argon2 hashes and base64url secrets reach the containers unchanged.
const escaped = Object.entries(values).map(
  ([key, value]) => `${key}=${String(value).split('$').join('$$')}`,
);
fs.writeFileSync(envFile, `${escaped.join('\n')}\n`, { mode: 0o600 });

const compose = [
  'compose',
  '-p',
  project,
  '--env-file',
  envFile,
  '-f',
  devMode ? 'docker-compose.dev.yml' : 'docker-compose.test.yml',
];
if (overrideFile) compose.push('-f', overrideFile);
const baseUrl = `http://127.0.0.1:${webPort}`;
// The development profile keeps the API internal; reach it through the web
// proxy. The test profile publishes the API port for direct checks.
const apiUrl = devMode ? baseUrl : `http://127.0.0.1:${apiPort}`;
const databaseUrl = `postgres://portfolio:${databasePassword}@127.0.0.1:${dbPort}/portfolio`;

function testEnv(extra = {}) {
  return {
    ...process.env,
    SMOKE_BASE_URL: baseUrl,
    SMOKE_ORIGIN: origin,
    SMOKE_ADMIN_EMAIL: adminEmail,
    SMOKE_ADMIN_PASSWORD: adminPassword,
    SMOKE_DATABASE_URL: databaseUrl,
    SMOKE_SESSION_SECRET: sessionSecret,
    SMOKE_ALLOW_MUTATIONS: 'true',
    REQUIRE_INTEGRATION: '1',
    ...extra,
  };
}

async function checkLogsDoNotContainSecrets() {
  const result = await run('docker', [
    ...compose,
    'logs',
    '--no-color',
    'api',
    'web',
  ]);
  const logs = `${result.stdout}\n${result.stderr}`;
  const forbidden = [
    adminPassword,
    databasePassword,
    sessionSecret,
    actionKey,
    'dev_session=',
    'csrfToken',
  ];
  const leaked = forbidden.filter((value) => value && logs.includes(value));
  if (leaked.length)
    throw new Error(
      `Test logs contained ${leaked.length} forbidden secret marker(s).`,
    );
}

async function verifyRuntimeContainer() {
  const result = await run('docker', [
    ...compose,
    'run',
    '--rm',
    '--no-deps',
    'api',
    'node',
    '-e',
    [
      "const fs=require('fs');",
      "if (process.getuid()===0) { console.error('running as root'); process.exit(1); }",
      "for (const f of ['server.js','lib/config.js','lib/migrations.js','migrations/001_admin_security.sql','projects.json','index.html','developer.html','.next/BUILD_ID']) if (!fs.existsSync(f)) { console.error('missing '+f); process.exit(1); }",
      "fs.mkdirSync('uploads',{recursive:true}); fs.accessSync('uploads',fs.constants.W_OK);",
    ].join(''),
  ]);
  if (result.code !== 0)
    throw new Error(
      'Runtime container check failed (non-root or missing file).',
    );
}

async function verifyReadinessFailureAndShutdown() {
  const stopped = await run('docker', [...compose, 'stop', 'db']);
  if (stopped.code !== 0) throw new Error('Could not stop the test database.');
  await waitFor(`${apiUrl}/api/ready`, 503, 30_000);

  const container = await run('docker', [...compose, 'ps', '-q', 'api']);
  const containerId = container.stdout.trim();
  const stoppedApi = await run('docker', [...compose, 'stop', 'api']);
  if (stoppedApi.code !== 0) throw new Error('Could not stop the test API.');
  const logs = await run('docker', [...compose, 'logs', '--no-color', 'api']);
  if (!`${logs.stdout}\n${logs.stderr}`.includes('shutdown_complete'))
    throw new Error('API did not log a graceful shutdown.');
  if (containerId) {
    const inspect = await run('docker', [
      'inspect',
      '-f',
      '{{.State.ExitCode}}',
      containerId,
    ]);
    if (inspect.stdout.trim() !== '0')
      throw new Error('API container did not exit cleanly on SIGTERM.');
  }
}

async function verifyDevLogin() {
  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (login.status !== 200)
    throw new Error(`Development login returned ${login.status}.`);

  const setCookie = login.headers.get('set-cookie') || '';
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/'])
    if (!setCookie.includes(flag))
      throw new Error(`Development cookie is missing ${flag}.`);
  if (/;\s*Secure/i.test(setCookie))
    throw new Error('Development cookie was unexpectedly Secure.');
  const cookie = setCookie.split(';')[0];
  if (!cookie.startsWith('dev_session='))
    throw new Error('Development login did not set the session cookie.');

  const projects = await fetch(`${baseUrl}/api/projects`, {
    headers: { cookie },
  });
  if (projects.status !== 200)
    throw new Error(`Authenticated projects read returned ${projects.status}.`);
  const csrfToken = projects.headers.get('x-csrf-token');
  if (!csrfToken) throw new Error('Authenticated read did not return CSRF.');

  const logout = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { cookie, origin, 'x-csrf-token': csrfToken },
  });
  if (logout.status !== 200)
    throw new Error(`Development logout returned ${logout.status}.`);

  const revoked = await fetch(`${baseUrl}/api/projects`, {
    headers: { cookie },
  });
  if (revoked.status !== 401)
    throw new Error(`Revoked development session returned ${revoked.status}.`);

  console.log('Development login, cookie, CSRF, and logout checks passed.');
}

async function cleanup() {
  await run('docker', [...compose, 'down', '-v', '--remove-orphans'], {
    inherit: true,
  });
  for (const file of [envFile, overrideFile])
    try {
      if (file) fs.rmSync(file, { force: true });
    } catch {}
}

let exitCode = 0;
try {
  const docker = await run('docker', ['info'], { inherit: false });
  if (docker.code !== 0)
    throw new Error('Docker is required for the isolated test stack.');

  const up = await run('docker', [...compose, 'up', '-d', '--build'], {
    inherit: true,
  });
  if (up.code !== 0)
    throw new Error('Could not start the isolated test stack.');

  await waitFor(`${apiUrl}/api/ready`, 200);
  await waitFor(`${baseUrl}/`, 200);
  await verifyRuntimeContainer();

  if (mode === 'integration') {
    const testFiles = fs
      .readdirSync(path.join(root, 'tests/integration'))
      .filter((file) => file.endsWith('.test.js'))
      .map((file) => path.join('tests/integration', file));
    const tests = await run(process.execPath, ['--test', ...testFiles], {
      inherit: true,
      env: testEnv(),
    });
    if (tests.code !== 0) throw new Error('Integration tests failed.');
    const smoke = await run(npmCommand, ['run', 'smoke'], {
      inherit: true,
      env: testEnv(),
    });
    if (smoke.code !== 0) throw new Error('Smoke checks failed.');
  } else if (devMode) {
    const smoke = await run(npmCommand, ['run', 'smoke'], {
      inherit: true,
      env: testEnv(),
    });
    if (smoke.code !== 0) throw new Error('Development smoke checks failed.');
    await verifyDevLogin();
  } else if (mode === 'browser') {
    const browser = await run(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['playwright', 'test', '--config=playwright.config.js'],
      { inherit: true, env: testEnv({ SMOKE_TEST_MODE: 'development' }) },
    );
    if (browser.code !== 0) throw new Error('Browser security tests failed.');
  } else {
    const smoke = await run(npmCommand, ['run', 'smoke'], {
      inherit: true,
      env: testEnv(),
    });
    if (smoke.code !== 0) throw new Error('Smoke checks failed.');
  }

  await checkLogsDoNotContainSecrets();
  await verifyReadinessFailureAndShutdown();
} catch (error) {
  console.error(error.message);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
