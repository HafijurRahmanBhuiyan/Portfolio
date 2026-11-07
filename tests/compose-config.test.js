import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const production = read('docker-compose.yml');
const development = read('docker-compose.dev.yml');
const testStack = read('docker-compose.test.yml');
const dockerfile = read('Dockerfile');
const example = read('.env.example');
const readme = read('README.md');
const security = read('docs/security.md');

test('production Compose requires every security-critical variable', () => {
  for (const variable of [
    'POSTGRES_PASSWORD',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD_HASH',
    'SESSION_SECRET',
    'TRUSTED_ORIGINS',
    'TRUST_PROXY_HOPS',
    'HTTPS_TERMINATED',
    'APP_ENV',
  ])
    assert.match(
      production,
      new RegExp(`\\$\\{${variable}:\\?`),
      `${variable} must fail closed when missing`,
    );

  assert.match(production, /NODE_ENV: production/);
  assert.doesNotMatch(production, /TRUST_PROXY_HOPS: \$\{[^}]+:-/);
  assert.doesNotMatch(production, /APP_ENV: \$\{[^}]+:-/);
  assert.doesNotMatch(production, /HTTPS_TERMINATED: \$\{[^}]+:-/);
});

test('development Compose is explicit and does not inherit production HTTPS settings', () => {
  assert.match(development, /NODE_ENV: development/);
  assert.match(development, /APP_ENV: development/);
  assert.match(development, /HTTPS_TERMINATED: 'false'/);
  assert.match(development, /TRUST_PROXY_HOPS: '0'/);
  assert.match(
    development,
    /TRUSTED_ORIGINS: \$\{TRUSTED_ORIGINS:-http:\/\/localhost:3000,http:\/\/127\.0\.0\.1:3000\}/,
  );
  assert.match(development, /ADMIN_PASSWORD_HASH: \$\{ADMIN_PASSWORD_HASH:\?/);

  const dbBlock = development.split(/^  api:/m)[0];
  assert.doesNotMatch(dbBlock, /ports:/, 'development db must stay internal');
});

test('development and production use distinct database volumes', () => {
  assert.match(production, /^  portfolio-db:$/m);
  assert.match(development, /^  portfolio-db-dev:$/m);
  assert.notEqual('portfolio-db', 'portfolio-db-dev');
});

test('uploaded project logos use separate persistent volumes', () => {
  assert.match(production, /^  portfolio-uploads:$/m);
  assert.match(development, /^  portfolio-uploads-dev:$/m);
  assert.match(production, /- portfolio-uploads:\/app\/uploads/);
  assert.match(development, /- portfolio-uploads-dev:\/app\/uploads/);
  assert.match(dockerfile, /mkdir -p \/app\/uploads/);
});

test('every API service pins UPLOAD_DIR to the mounted upload path', () => {
  for (const compose of [production, development, testStack])
    assert.match(compose, /UPLOAD_DIR: \/app\/uploads/);
  assert.match(dockerfile, /^ENV UPLOAD_DIR=\/app\/uploads$/m);
});

test('the API image does not bake in PORT and would shadow API_PORT', () => {
  assert.doesNotMatch(dockerfile, /^ENV PORT=/m);
  for (const compose of [production, development, testStack]) {
    const apiBlock = compose.split(/^  web:/m)[0];
    assert.doesNotMatch(
      apiBlock,
      /^\s+PORT:/m,
      'API service must use API_PORT, not PORT',
    );
    assert.match(apiBlock, /API_PORT: 4000/);
  }
});

test('.env is ignored and never tracked', () => {
  const ignored = spawnSync('git', ['check-ignore', '-q', '.env'], {
    cwd: root,
  });
  assert.equal(ignored.status, 0, '.env must be ignored by Git');

  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '.env'], {
    cwd: root,
  });
  assert.notEqual(tracked.status, 0, '.env must not be tracked');
});

test('.env.example contains placeholders, not real credentials', () => {
  assert.match(example, /^ADMIN_PASSWORD_HASH=\s*$/m);
  assert.doesNotMatch(example, /\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
  assert.doesNotMatch(example, /^ADMIN_PASSWORD=/m);
  assert.match(example, /POSTGRES_PASSWORD=dev-only-/);
  assert.match(example, /SESSION_SECRET=dev-only-/);
});

test('documentation includes safe local and production commands', () => {
  for (const document of [readme, security]) {
    assert.match(
      document,
      /docker compose -f docker-compose\.dev\.yml config -q/,
    );
    assert.match(document, /docker compose config -q/);
    assert.match(document, /docker compose -f docker-compose\.dev\.yml down/);
    assert.match(document, /docker compose down/);
  }
  assert.match(readme, /down -v/);
  assert.match(security, /down -v/);
});
