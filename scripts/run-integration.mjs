import fs from 'node:fs';
import path from 'node:path';
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
    await run(process.execPath, ['scripts/test-stack.mjs', 'integration']),
  );
}

if (!process.env.SMOKE_BASE_URL) {
  console.error(
    'SMOKE_BASE_URL is required when SMOKE_USE_EXISTING_STACK=1. Omit that variable to start an isolated disposable stack automatically.',
  );
  process.exit(2);
}
const files = fs
  .readdirSync(path.join(root, 'tests/integration'))
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => path.join('tests/integration', file));
process.exit(await run(process.execPath, ['--test', ...files]));
