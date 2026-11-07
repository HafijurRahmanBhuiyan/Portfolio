import fs from 'node:fs';

const root = new URL('../.next/', import.meta.url);
function read(relative) {
  return JSON.parse(fs.readFileSync(new URL(relative, root), 'utf8'));
}
function write(relative, value) {
  fs.writeFileSync(new URL(relative, root), `${JSON.stringify(value)}\n`);
}

const actions = read('server/server-reference-manifest.json');
if (typeof actions.encryptionKey === 'string') actions.encryptionKey = '';
write('server/server-reference-manifest.json', actions);

const middleware = read('server/middleware-manifest.json');
const env = middleware.middleware?.['/']?.env;
if (env) {
  for (const key of [
    'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    '__NEXT_PREVIEW_MODE_ID',
    '__NEXT_PREVIEW_MODE_SIGNING_KEY',
    '__NEXT_PREVIEW_MODE_ENCRYPTION_KEY',
  ])
    env[key] = '';
}
write('server/middleware-manifest.json', middleware);

const prerender = read('prerender-manifest.json');
if (prerender.preview) {
  // Vercel's final serverless packaging reads previewModeId as its
  // prerender bypassToken and requires at least 32 characters. Next.js
  // generates a valid value during the build, so retain only this identifier
  // while removing the signing and encryption keys below.
  prerender.preview.previewModeSigningKey = '';
  prerender.preview.previewModeEncryptionKey = '';
}
write('prerender-manifest.json', prerender);
fs.rmSync(new URL('cache/', root), { recursive: true, force: true });
