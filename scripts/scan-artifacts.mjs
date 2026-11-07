import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const findings = [];
const secretEnvNames = [
  'ADMIN_PASSWORD_HASH',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'PGPASSWORD',
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
];
const secretValues = secretEnvNames
  .map((name) => process.env[name])
  .filter((value) => typeof value === 'string' && value.length >= 8);

function readJson(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    findings.push(`invalid JSON artifact: ${relative}`);
    return null;
  }
}

function assertEmpty(relative, value, label) {
  if (typeof value === 'string' && value.length > 0)
    findings.push(`non-empty ${label} in ${relative}`);
}

const actions = readJson('server/server-reference-manifest.json');
if (actions)
  assertEmpty(
    'server/server-reference-manifest.json',
    actions.encryptionKey,
    'action encryption key',
  );

const middleware = readJson('server/middleware-manifest.json');
if (middleware?.middleware?.['/']?.env) {
  for (const key of [
    'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    '__NEXT_PREVIEW_MODE_ID',
    '__NEXT_PREVIEW_MODE_SIGNING_KEY',
    '__NEXT_PREVIEW_MODE_ENCRYPTION_KEY',
  ])
    assertEmpty(
      'server/middleware-manifest.json',
      middleware.middleware['/'].env[key],
      key,
    );
}

const prerender = readJson('prerender-manifest.json');
if (prerender?.preview) {
  for (const key of [
    'previewModeId',
    'previewModeSigningKey',
    'previewModeEncryptionKey',
  ])
    assertEmpty('prerender-manifest.json', prerender.preview[key], key);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'cache' || entry.name === 'node_modules') continue;
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const scanRoots = [path.join(root, '.next'), path.join(root, 'public')];
for (const directory of scanRoots) {
  for (const file of walk(directory)) {
    const relative = path.relative(root, file);
    if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf)$/i.test(file))
      continue;
    if (fs.statSync(file).size > 5_000_000) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
      findings.push(`private key material in ${relative}`);
    if (/postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@/.test(text))
      findings.push(`database URL with credentials in ${relative}`);
    for (const value of secretValues) {
      if (text.includes(value))
        findings.push(`configured secret value in ${relative}`);
    }
  }
}

if (fs.existsSync(path.join(root, 'public/.env')))
  findings.push('environment file copied into public/');

if (findings.length) {
  console.error('Artifact secret scan failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log('Artifact secret scan passed.');
