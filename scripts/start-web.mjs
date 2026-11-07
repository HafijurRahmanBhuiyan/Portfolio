import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.next/', import.meta.url));
function read(relative) {
  return JSON.parse(fs.readFileSync(`${root}/${relative}`, 'utf8'));
}
function write(relative, value) {
  fs.writeFileSync(`${root}/${relative}`, `${JSON.stringify(value)}\n`);
}
const env = { ...process.env };
const actionKey =
  env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
  crypto.randomBytes(32).toString('base64');
const decoded = Buffer.from(actionKey, 'base64');
if (
  ![16, 24, 32].includes(decoded.length) ||
  decoded.toString('base64') !== actionKey
) {
  throw new Error(
    'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be base64 for an AES key of 16, 24, or 32 bytes.',
  );
}
const preview = {
  previewModeId: crypto.randomBytes(16).toString('hex'),
  previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
  previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
};

const actions = read('server/server-reference-manifest.json');
actions.encryptionKey = actionKey;
write('server/server-reference-manifest.json', actions);
const middleware = read('server/middleware-manifest.json');
middleware.middleware['/'].env = {
  ...middleware.middleware['/'].env,
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: actionKey,
  __NEXT_PREVIEW_MODE_ID: preview.previewModeId,
  __NEXT_PREVIEW_MODE_SIGNING_KEY: preview.previewModeSigningKey,
  __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: preview.previewModeEncryptionKey,
};
write('server/middleware-manifest.json', middleware);
const prerender = read('prerender-manifest.json');
prerender.preview = preview;
write('prerender-manifest.json', prerender);
env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = actionKey;

const child = spawn(
  'node',
  ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0'],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env,
    stdio: 'inherit',
  },
);
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    shuttingDown = true;
    child.kill(signal);
  });
child.on('error', () => process.exit(1));
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (shuttingDown && signal ? 0 : 1);
});
