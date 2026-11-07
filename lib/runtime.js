import path from 'node:path';

/**
 * The API must listen on all interfaces. Render (and container platforms in
 * general) route traffic to the service from outside the loopback interface.
 */
export const API_LISTEN_HOST = '0.0.0.0';

/**
 * Resolve the API listener port.
 *
 * Precedence is intentional:
 *   1. `PORT`       — injected by Render and most container platforms.
 *   2. `API_PORT`   — used by Docker Compose, which does not set `PORT` for
 *                     the API service because the same image also runs Next.
 *   3. `4000`       — local default.
 */
export function resolveApiPort(env = process.env) {
  const raw = env.PORT || env.API_PORT || '4000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('API port must be an integer between 1 and 65535.');
  return port;
}

/**
 * Resolve the upload directory. Production deployments must point this at a
 * persistent disk (Render) or a named volume (Docker Compose); the default is
 * a local directory for development only.
 */
export function resolveUploadsDir(env = process.env, root = process.cwd()) {
  const raw = String(env.UPLOAD_DIR || '').trim();
  return raw ? path.resolve(root, raw) : path.join(root, 'uploads');
}
