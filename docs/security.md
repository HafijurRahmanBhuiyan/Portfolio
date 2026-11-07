# Security Architecture and Operations

This document records the security controls implemented in this repository,
how they are verified, and what still depends on the deployment environment.
It is deliberately conservative: passing tests demonstrate the listed
behaviours, not the absence of every possible vulnerability.

## Environment policy

Production mode is enabled when **either** `NODE_ENV` or `APP_ENV` is
`production`. When both are set they must agree. In particular,
`NODE_ENV=production` cannot be downgraded by `APP_ENV=development`; any
explicit contradiction, unknown environment value, or invalid production
setting exits with one generic `configuration_error` line.

The policy lives in `lib/config.js` and is enforced before the API opens a
database connection or listens on a port.

### Required production settings

| Variable               | Requirement                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV` / `APP_ENV` | `production`; if both are present they must match                                            |
| `HTTPS_TERMINATED`     | `true`                                                                                       |
| `TRUSTED_ORIGINS`      | One or more HTTPS origins; no localhost, loopback, paths, credentials, queries, or fragments |
| `ADMIN_EMAIL`          | Valid mailbox address                                                                        |
| `ADMIN_PASSWORD_HASH`  | Argon2id hash with at least `m=19456,t=2,p=1`                                                |
| `SESSION_SECRET`       | Random base64url value, at least 43 characters, with sufficient symbol diversity             |
| `POSTGRES_PASSWORD`    | At least 24 bytes, with sufficient symbol diversity (Compose/PG* deployments)                |
| `DATABASE_URL`         | Optional direct Neon URL with `sslmode=require`; pooled `-pooler` hosts are rejected         |
| `UPLOAD_DIR`           | Absolute path to a persistent disk/volume; required in production                            |
| `TRUST_PROXY_HOPS`     | Integer `0`–`10` matching the exact trusted proxy chain                                      |

When `RENDER=true` (set automatically by Render), the API additionally requires
production mode and a non-empty `DATABASE_URL`. The API never logs the URL or
its password.

Production cookies are always `Secure`. HSTS is emitted only when the runtime
is production **and** `HTTPS_TERMINATED=true`.

Generate secrets without printing them into shell history or tickets:

```bash
node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url')+'\n')"
read -s ADMIN_PASSWORD_INPUT
printf '%s' "$ADMIN_PASSWORD_INPUT" | node scripts/hash-admin-password.mjs
unset ADMIN_PASSWORD_INPUT
```

## Header ownership

| Surface                           | Owner             | Headers                                                                                                   |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| Portfolio/admin pages             | `middleware.js`   | Page CSP (nonce + `strict-dynamic`), page HSTS when production + HTTPS termination                        |
| Static web assets and Next routes | `next.config.mjs` | Common non-CSP headers (`nosniff`, referrer policy, permissions policy, frame denial, COOP/CORP) and HSTS |
| API responses                     | `server.js`       | API CSP (`default-src 'none'`), common API headers, HSTS                                                  |

The middleware matcher excludes `/api`, so one response never receives two
different CSP policies. `script-src` never contains `'unsafe-inline'`; the
nonce and `'strict-dynamic'` are the script trust mechanism. `'unsafe-eval'`
is added only outside production for the Next.js development runtime.

`style-src` still permits inline styles because the portfolio uses inline
style attributes and Next.js injects style resources. This is a style-only
exception and does not allow inline script execution.

### Google Fonts

The layout loads Sora, Inter, and JetBrains Mono from
`fonts.googleapis.com`/`fonts.gstatic.com`. The CSP allows those two font
hosts explicitly. This is a third-party request that reveals the visitor's IP
to Google; if that is not acceptable, self-host the font files and remove the
Google Fonts links and CSP hosts.

## Trusted HTML boundary

`lib/trusted-html.js` extracts the `<body>` from the repository-controlled
`index.html` and `developer.html`, removes script elements, inline event
handlers, and `javascript:`/`vbscript:` URLs. The result is rendered through
`dangerouslySetInnerHTML`.

This helper is a boundary for **trusted repository files only**. It is not a
general-purpose sanitiser for database or admin-controlled content. Project
data is fetched from the API and inserted into the DOM with `textContent`;
URLs are validated to HTTP(S) and same-origin image paths before use. Modal
content is built with DOM APIs, event delegation, and `textContent`, not HTML
strings.

## Authentication, sessions, and CSRF

- Admin passwords are verified against an Argon2id hash. Email comparison and
  CSRF comparison use timing-safe primitives.
- Login failures return one generic message. Repeated failures are tracked per
  IP and per account in `login_attempts`; the block grows up to 15 minutes.
- Session tokens are 32 random bytes encoded as base64url. Only an HMAC-SHA-256
  reference is stored in `admin_sessions`.
- Cookies are `HttpOnly`, `SameSite=Strict`, `Secure` in production, scoped to
  `/`, with an 8-hour absolute lifetime. Idle sessions expire after 30 minutes.
- The CSRF token is derived deterministically from the opaque session token and
  the session secret. The API returns it on authenticated reads and stores only
  its HMAC. Mutations require a trusted `Origin` and a matching
  `X-CSRF-Token`.
- Project writes require `If-Match` with the current collection ETag. A stale
  write returns `409` and does not mutate data.
- Project ordering is not a separate mutation path. The dashboard reorders its
  in-memory list by stable project IDs and saves the complete array through the
  existing authenticated `PUT /api/projects` route with the CSRF token and
  `If-Match`. The API validates every record, rejects duplicate IDs, and writes
  `sort_order` from the array index inside the version-checked transaction.
  Drag-and-drop and the keyboard-accessible Move up/Move down controls both use
  this same save path. A stale order save receives `409`; the dashboard reloads
  the latest collection for review rather than merging or overwriting it.
- Logo uploads require the same trusted `Origin`, `X-CSRF-Token`, and live
  server-side session as project mutations. Successful uploads write an
  `admin_audit` record containing only the random filename, image type, and
  byte count.
- Successful and failed authentication, rate limiting, project writes, and
  failed uploads emit non-secret JSON log events. `admin_audit` retains request
  IDs, HMAC session references, actor identity, action/resource, and non-secret
  summaries for 365 days.

## Input validation

`lib/projects.js` rejects unknown fields, nested values, oversized strings,
control characters, duplicate/unsafe IDs, dangerous URL protocols, and remote
image URLs. Tags are trimmed and checked for control characters. The API also
caps the collection at 100 projects and rejects duplicate IDs.

Logo uploads use the same session, trusted-Origin, and CSRF checks as project
writes. `POST /api/uploads` accepts only PNG, JPEG, WebP, and GIF, verifies the
declared type against magic bytes, rejects files over 2 MB, and writes a random
128-bit filename with an immutable cache policy. SVG, HTML, and remote image
URLs are not accepted. Uploads are stored in `UPLOAD_DIR`: the dedicated
`portfolio-uploads` volume (`portfolio-uploads-dev` in development) in Compose,
or a mounted Render persistent disk in the managed topology. Redeploying or
rebuilding does not delete project logos only when that storage is persistent.
`GET /api/uploads/:file` serves only existing random filenames with a fixed
image content type and `nosniff`; directory traversal and unknown names return
`404`.

## Migrations and rollback

`lib/migrations.js` serialises migration runs with a PostgreSQL advisory lock.
Each migration and its `schema_migrations` row commit in one transaction, so a
failed migration leaves neither partial DDL nor a false “applied” record.

- `001_admin_security.sql` creates the project, session, login-attempt,
  collection-version, and audit tables idempotently.
- `002_audit_and_session_hardening.sql` adds retention/query indexes and
  object-shape constraints.

There is intentionally no destructive down migration: dropping session or
audit tables would discard security records. To roll back application code,
restore the previous release’s image/Compose configuration and run:

```bash
docker compose up -d --no-deps api web
```

Leave the additive schema in place. If a schema rollback is ever unavoidable,
take a verified backup first and perform it in a maintenance window.

## Local development

Use the explicit development profile. `ADMIN_PASSWORD_HASH` is still required;
authentication is never disabled.

```bash
cp .env.example .env

# Generate the hash without printing the password.
read -s ADMIN_PASSWORD_INPUT
printf '%s' "$ADMIN_PASSWORD_INPUT" | node scripts/hash-admin-password.mjs
unset ADMIN_PASSWORD_INPUT
```

Put the output in `.env` quoted, because Argon2id hashes contain `$`:

```dotenv
ADMIN_PASSWORD_HASH='$argon2id$...'
```

Then validate and start:

```bash
docker compose -f docker-compose.dev.yml config -q
docker compose -f docker-compose.dev.yml up --build
```

Open `http://localhost:3000` and `http://localhost:3000/developer`. The login
email is `ADMIN_EMAIL`; the login password is the one used to generate the
hash. Stop with `docker compose -f docker-compose.dev.yml down`. `down -v`
also deletes the development database volume and must never be used casually
or in production.

The development profile sets `NODE_ENV=development`, `APP_ENV=development`,
`HTTPS_TERMINATED=false`, HTTP localhost origins, no host-published database
port, and the separate `portfolio-db-dev` volume. Its fallback credentials are
development-only; the production validator rejects `dev-only`/`do-not-use`
values, so they cannot be reused. `docker-compose.yml` is the production
profile and requires the production variables above.

## HTTPS production deployment

1. Put a trusted TLS-terminating proxy in front of the `web` service. Point
   DNS at the proxy and do not publish the API or database ports.
2. Set `NODE_ENV=production`, `APP_ENV=production`, `HTTPS_TERMINATED=true`,
   the exact HTTPS `TRUSTED_ORIGINS`, and `TRUST_PROXY_HOPS` matching the
   proxy chain. Missing values fail before containers start; insecure values
   fail the production configuration check.
3. Have the proxy overwrite `X-Forwarded-*` headers and send
   `X-Forwarded-Proto: https`.
4. Set all secrets through the deployment secret store, not a committed file.
5. Validate without printing resolved secrets, then start:

   ```bash
   docker compose config -q
   docker compose up --build -d
   ```

6. Check health and logs:

   ```bash
   docker compose ps
   docker compose logs --tail=100 api web db
   curl -fsS https://your-real-domain.example/api/health
   curl -fsS https://your-real-domain.example/api/ready
   ```

7. If the web tier is scaled across replicas, set one shared
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for all replicas. Without Server
   Actions the entrypoint generates a runtime key. The build scrubs its
   generated action and preview signing/encryption keys from `.next`, while
   retaining the generated `previewModeId` because Vercel requires it as a
   prerender bypass token of at least 32 characters.
8. Take a verified PostgreSQL backup before upgrades. Stop safely with
   `docker compose down`; never use `docker compose down -v` in production
   because it deletes the database volume.

## Managed deployment: Render + Neon + Vercel

The managed topology separates the public frontend from the API:

- **Vercel** serves the Next.js frontend, including `/developer`. Browser code
  calls relative `/api/...` paths only.
- **Render** runs the Express API as a Web Service with build command
  `npm ci --omit=dev`, start command `npm run api`, and health check path
  `/api/ready`. The API reads `PORT` first, then `API_PORT`, then `4000`, and
  binds `0.0.0.0`. Render's injected `PORT` must win; Docker Compose keeps
  using `API_PORT=4000` because the image no longer bakes in `PORT`.
- **Neon** provides PostgreSQL over TLS.

### Neon connection requirements

Use the **direct** Neon connection string with connection pooling disabled and
`sslmode=require` (or `verify-full`). Do not use the `-pooler` hostname: startup
migrations take a session-level advisory lock
(`pg_advisory_lock(hashtext('portfolio_schema_migrations'))`), and a transaction
pooler cannot guarantee session affinity. The API rejects pooled hostnames and,
in production, URLs without TLS. The error is generic and never includes the
connection string.

If migrations are ever moved to a separate one-time job, that job must still use
a direct connection; ordinary application traffic may then use a pooler.

### Vercel rewrite and origin policy

Vercel sets `API_INTERNAL_URL` to the Render API origin. `next.config.mjs` uses
it only in the server-side `/api/:path*` rewrite; it is not a
`NEXT_PUBLIC_*` variable and is not shipped to the browser. A production Vercel
build fails if the destination is missing, non-HTTPS, localhost, or includes a
path. Trailing slashes are normalized.

Set `TRUSTED_ORIGINS` on Render to the exact Vercel production origin, for
example `https://your-vercel-production-origin.example` with no path, query, or
wildcard. Requests rewritten through Vercel preserve the browser `Origin`
header, so the API's Origin check still applies. Session cookies remain
`HttpOnly`, `SameSite=Strict`, and `Secure` in production.

Vercel preview deployments use different origins and are rejected by the
production allow-list. If preview admin login is required, use a separate
preview backend/configuration with its own trusted origin. Do not add
`*.vercel.app` or another wildcard to production.

Redeploy Vercel after changing `API_INTERNAL_URL` or `HTTPS_TERMINATED`; the
rewrite is resolved when the deployment starts.

### Upload persistence

Render's default filesystem is ephemeral. Attach a persistent disk at the exact
upload path and set `UPLOAD_DIR` to that absolute path (for example
`/var/data/uploads`). The startup check creates the directory and verifies it is
writable, and `/api/ready` repeats the writability check, but only the mounted
disk provides persistence across deploys and restarts. Do not delete the disk
while rotating credentials or redeploying.

### Render environment variables

Names only; values come from Render secrets:

`NODE_ENV`, `APP_ENV`, `HTTPS_TERMINATED`, `TRUSTED_ORIGINS`,
`TRUST_PROXY_HOPS`, `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
`SESSION_SECRET`, `UPLOAD_DIR`.

Render injects `PORT`; do not set it manually. Set `TRUST_PROXY_HOPS` to the
exact number of trusted proxies (typically `1` for a single Render Web Service)
and verify it rather than guessing.

### Post-deploy checks

```bash
curl -fsS https://your-render-service.onrender.com/api/health
curl -fsS https://your-render-service.onrender.com/api/ready
curl -fsS https://your-vercel-app.vercel.app/api/public-projects
```

Then open the Vercel production URL and `/developer`, sign in, confirm the
cookie flags, upload a logo, redeploy the Render service, and confirm the logo
still loads.

## Credential rotation

Treat every value that was ever present in a local `.env`, shell history, or
old deployment configuration as exposed.

1. Generate new database, session, admin, and action-key values with the
   commands above.
2. For PostgreSQL, update the role password and the API secret in the same
   maintenance window:

   ```bash
   docker compose exec db psql -U portfolio -d portfolio \
     -c "ALTER ROLE portfolio WITH PASSWORD 'new-password';"
   ```

   Do not paste real values into tickets, logs, or this repository.

3. Update the deployment secret store, then restart API instances. Changing
   `SESSION_SECRET` invalidates all existing sessions and is expected to sign
   everyone out.
4. Replace the admin password hash and verify a fresh login.
5. Revoke old credentials at the provider/proxy and review Git history and
   backups for exposure. No database volume deletion is required.

## Verification commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
npm run check:duplicates
npm run scan:artifacts
npm run test:integration
npm run test:browser
npm run test:smoke
npm run check:compose
npm run test:dev
```

`check:compose` validates both Compose files with generated test-only values
and checks required production variables, insecure HTTPS/origin settings,
environment downgrade rejection, distinct volume names, and development
localhost defaults without printing secrets. `test:dev` starts the real
development Compose profile with a disposable tmpfs database, generated
test-only credentials, and a unique project name.

`test:integration`, `test:browser`, `test:smoke`, and `test:dev` create
disposable Docker Compose projects with generated test-only credentials and
project-specific cleanup. They do not touch production volumes. Integration
and smoke run the production configuration over HTTP with an explicit HTTPS
test origin; browser and dev checks run an explicit development configuration
so HTTP assets load without `upgrade-insecure-requests`.

The integration suite covers public/API routes, headers, CSP, auth, session
expiry, CSRF, Origin rejection, ETag conflicts, audit records, rate limiting,
log secret scans, readiness failure, and graceful shutdown. The browser suite
covers CSP violations, trusted-script execution, modal behaviour with malicious
project text, admin CSRF/stale-write/revocation/logout behaviour, and absence of
test secrets in the DOM, storage, and loaded scripts.

## Remaining risks and limitations

- Browser tests run Chromium only; they are not a cross-browser security
  guarantee.
- Google Fonts is a third-party request (see above).
- There is no MFA or multi-admin role model; protect the single admin account
  and deployment secrets accordingly.
- Application-level rate limiting is not a DDoS defence; use proxy/WAF limits.
- `npm audit` reflects known advisories at the time it runs.
- The trusted-HTML helper is not a general sanitiser; keep it limited to
  repository-controlled files.
- Docker image signing, runtime malware scanning, and external SIEM export are
  deployment responsibilities, not covered by this repository’s tests.
