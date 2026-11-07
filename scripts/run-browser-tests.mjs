import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const useExisting = process.env.SMOKE_USE_EXISTING_STACK === '1';

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

if (!useExisting) {
  process.exit(
    await run(process.execPath, ['scripts/test-stack.mjs', 'browser']),
  );
}

if (!process.env.SMOKE_BASE_URL) {
  console.error(
    'SMOKE_BASE_URL is required when SMOKE_USE_EXISTING_STACK=1. Omit that variable to start an isolated disposable stack automatically.',
  );
  process.exit(2);
}
process.exit(
  await run(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['playwright', 'test', '--config=playwright.config.js'],
    process.env,
  ),
);
