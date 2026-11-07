# Hafijur Rahman Bhuiyan — Personal Portfolio

A responsive portfolio powered by a **Next.js frontend, Express.js API, and PostgreSQL**. Docker Compose starts the web app, API, and database together; project changes made in Developer Mode are stored in PostgreSQL and shown on the public portfolio.

The site is a résumé in browser form: an ambient Web Audio soundscape, an animated canvas particle field, filterable skills and project grids, 3D card inspection modals, and a full light/dark theme system.

---

## Live Link: https://hafijurrahmanbhuiyan.github.io/Portfolio

## Table of Contents

- [Highlights](#highlights)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Feature Tour](#feature-tour)
- [Design System](#design-system)
- [Audio Engine](#audio-engine)
- [Local Development](#local-development)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Customization Guide](#customization-guide)
- [Browser Support](#browser-support)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Known Limitations](#known-limitations)

---

## Highlights

|                              |                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Database-backed projects** | Existing projects and new entries are read from PostgreSQL and updated through the authenticated admin dashboard |
| **Single-command startup**   | Docker Compose builds and runs Next.js, Express, and PostgreSQL together                                         |
| **18 feature modules**       | One organized IIFE in `js/script.js`, each module in its own numbered, commented section                         |
| **Synthesized audio**        | A generative ambient soundscape built live with the Web Audio API — no audio files to download                   |
| **Dual theme**               | Obsidian-dark default and a full light theme, driven by CSS custom properties and persisted to `localStorage`    |
| **Themeable in one place**   | ~40 design tokens in `:root` control the entire visual language                                                  |

---

## Tech Stack

| Layer       | Choice                                     | Rationale                                                                      |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| Markup      | HTML5                                      | Semantic landmarks (`header`/`nav`/`main`/`section`/`footer`), ARIA attributes |
| Styling     | CSS3                                       | Custom properties, Grid, Flexbox, `clamp()` fluid type, keyframe animations    |
| Behavior    | Vanilla JavaScript (ES5-compatible syntax) | Web Audio API, Canvas 2D, IntersectionObserver, `matchMedia`                   |
| Icons       | Inline SVG                                 | Zero icon-font requests, inherits `currentColor`, styleable via CSS            |
| Fonts       | Sora / Inter / JetBrains Mono              | Self-hosted path via Google Fonts with `preconnect`                            |
| Frontend    | Next.js App Router + React                 | Server-rendered portfolio markup with optimized production build               |
| API         | Node.js + Express                          | Authenticated project management API with HTTP-only admin sessions             |
| Database    | PostgreSQL                                 | Persistent project records in a named Docker volume                            |
| Media       | Docker volume                              | Uploaded project logos served by the API and kept across redeploys             |
| Containers  | Docker Compose                             | One command starts the complete stack                                          |
| Media index | `metadata.json`                            | Lightweight capability descriptor for search/agent indexing                    |

---

## Project Structure

```
.
├── index.html              # 682 lines — all markup and content
├── css/
│   └── style.css           # 1519 lines — design system + all component styles
├── js/
│   └── script.js           # 1156 lines — all behavior, one commented IIFE
├── assets/
│   ├── favicon/            # 14 files — .ico, .svg, 16→512px PNGs, apple-touch-icons
│   ├── logos/              # 5 project card screenshots (ai-career-agent, servico, …)
│   ├── profile.jpg         # hero portrait
│   └── resume.pdf          # downloadable CV
├── app/                    # Next.js routes and responsive portfolio shell
├── server.js               # Express API, upload handling, and PostgreSQL initialization
├── docker-compose.yml      # Web, API, PostgreSQL, and persistent data/upload volumes
├── Dockerfile              # Multi-stage production image
├── projects.json           # One-time initial project seed
├── package.json            # scripts + the single express dependency
├── metadata.json           # name / description / capabilities descriptor
└── README.md
```

---

## Feature Tour

### 1. Ambient background music (Web Audio API)

A generative soundscape in D Dorian — layered sine/triangle oscillator pads with chorus detuning, a resonant low-pass filter, and a feedback delay for space. Occasional Rhodes-style bell chimes land on pentatonic notes. Master gain fades in over 1.8s and out over 1.2s. Toggled from the speaker button in the nav; the icon animates into a 3-bar EQ visualizer while playing. See [Audio Engine](#audio-engine).

### 2. Dual theme system

Dark (obsidian) and light themes, toggled from the nav. An inline blocking script in `<head>` applies the stored preference before first paint, eliminating the flash-of-wrong-theme. Persisted under `localStorage['hrb-theme']`.

### 3. Animated canvas background

A Canvas 2D particle field with drifting nodes and connecting proximity lines, layered over a CSS cyber-grid and three floating gradient orbs.

### 4. Cursor spotlight

A radial glow follows the pointer via `pointermove`, driven by CSS custom properties for zero-reflow tracking.

### 5. Hero role typewriter + live clock

Four roles cycle with a type/delete animation, alongside a live Dhaka (Asia/Dhaka) clock.

### 6. Interactive developer terminal

A tabbed faux terminal (`about` / `skills` / `terminal` panes) with syntax-colored output — a compact, skimmable summary of the résumé.

### 7. Filterable skills grid

Six discipline filters — All, Languages, Frontend, Backend & APIs, Databases, Tools & DevOps, AI/ML — filtering the skill cards by `data-category`.

### 8. Filterable project grid

Six projects filterable by AI & Automation, Full-Stack Systems, and Trading & Web via `data-pcat`.

### 9. 3D magnetic hover engine

Cards tilt toward the cursor with perspective transforms and a subtle magnetic pull, disabled automatically for touch devices and reduced-motion users.

### 10. Project inspection modal

Clicking a project opens a detail modal with a 3D flip between the project overview and its technical detail pane, drag-to-rotate on touch, background scroll lock, and `Escape` to dismiss.

### 11. Scroll orchestration

Scroll-progress beam, floating scroll-depth pill, back-to-top button, active-section nav highlighting (IntersectionObserver), and bidirectional reveal-on-scroll animations.

### 12. Toast feedback system

An `aria-live` toast region announces every interaction — theme switches, filters, audio toggles, resume downloads.

### 13. Mobile navigation

A slide-in drawer with hamburger toggle, outside-click dismissal, `Escape` to close, and link-click auto-close.

### 14. SEO & social metadata

Open Graph and Twitter card tags, a canonical description, a skip link, and a complete favicon/apple-touch-icon set across 14 sizes.

---

## Design System

All visual decisions live in CSS custom properties at the top of `css/style.css`, in two blocks: the dark defaults on `:root` and the light overrides on `:root[data-theme="light"]`.

```css
:root {
  --bg: #030712; /* page background      */
  --surface: #0b132b; /* raised surfaces      */
  --text: #f8fafc; /* primary text         */
  --accent: #3b82f6; /* primary accent       */
  --accent-cyan: #00f0ff; /* secondary accent     */
  --accent-gradient: linear-gradient(
    135deg,
    #00f0ff 0%,
    #3b82f6 45%,
    #8b5cf6 100%
  );
  --shadow-lg: 0 25px 60px -15px rgba(0, 0, 0, 0.85);
  --mono: 'JetBrains Mono', ui-monospace, monospace;
  --head: 'Sora', sans-serif;
  --body: 'Inter', sans-serif;
}
```

Changing a token re-themes the entire site in both modes. Additional conventions:

- **Fluid type** — `clamp()` for all responsive headings and spacing
- **Glass surfaces** — translucent cards with `backdrop-filter` and 1px hairline borders
- **Reduced motion** — a `prefers-reduced-motion: reduce` block disables animation globally

---

## Audio Engine

`js/script.js` section 2 is a self-contained generative music engine. No audio files ship with the site.

**Signal chain**

```
oscillator pairs (sine + detuned triangle)
        │
        ▼
   voiceGain  ── 0.016 / voiceIndex, equal-power attack/release
        │
        ▼
  lowpass BiquadFilter  ── 520 Hz, Q 1.2
        │
        ▼
  musicMasterGain  ── master volume, 1.8s fade-in / 1.2s fade-out
        │
        ├──► delayNode ⇄ delayGain (0.38s, 0.28 feedback)  ── wet echo
        ▼
  audioCtx.destination
```

**Musical design**

- **Progression** — a four-chord loop in D Dorian: Dm9 → B♭maj7 → Gm7 → Am7
- **Pad voices** — five oscillators per chord, each a detuned sine/triangle pair, each level scaled by `1 / (i + 1)` so the chord builds from bass upward
- **Bell chimes** — pentatonic hits (D4–E5) at 1.2s, 3.8s and 5.6s into each 7.5s chord
- **Voice hygiene** — the voice list is capped and trimmed so long sessions cannot leak oscillators

**Key parameters**

| Parameter        | Value             | Location                 |
| ---------------- | ----------------- | ------------------------ |
| Master volume    | `0.6`             | `js/script.js:145`       |
| Pad voice level  | `0.016 / (i + 1)` | `js/script.js:71`        |
| Bell chime peak  | `0.026`           | `js/script.js:103`       |
| Delay feedback   | `0.28` @ 0.38s    | `js/script.js:157`       |
| UI sound effects | `0.025`–`0.035`   | `js/script.js:238`–`241` |

> **Browser autoplay policy:** the site attempts to start the soundscape on page load. Browsers may block audible autoplay, especially on a new deployed origin; when that happens, the soundscape starts on the visitor's first trusted interaction. The speaker button remains available to pause or resume it.

---

## Local Development

Prerequisites: Docker Compose v2 and Node.js 22 for the password helper.

1. Copy the example file and keep the result ignored by Git:

   ```bash
   cp .env.example .env
   ```

2. Generate the admin password hash. The helper reads the password from stdin and never prints it:

   ```bash
   read -s ADMIN_PASSWORD_INPUT
   printf '%s' "$ADMIN_PASSWORD_INPUT" | node scripts/hash-admin-password.mjs
   unset ADMIN_PASSWORD_INPUT
   ```

   Put the single-line output in `.env` wrapped in single quotes, because Argon2id hashes contain `$`:

   ```dotenv
   ADMIN_PASSWORD_HASH='$argon2id$...'
   ```

   The password you typed is the login password. `ADMIN_EMAIL` in `.env` is the login email. Set a unique `POSTGRES_PASSWORD`; the development profile has a development-only `SESSION_SECRET` fallback, but a random value is preferred.

3. Validate the Compose configuration without printing resolved secrets:

   ```bash
   docker compose -f docker-compose.dev.yml config -q
   ```

4. Start the explicit development profile:

   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

Open `http://localhost:3000` and the admin dashboard at `http://localhost:3000/developer`.

The development profile sets `NODE_ENV=development`, `APP_ENV=development`, `HTTPS_TERMINATED=false`, HTTP localhost origins, no host-published PostgreSQL port, and the separate `portfolio-db-dev` volume. It still requires a valid `ADMIN_PASSWORD_HASH`; authentication is never disabled. Do not use this file for production.

Stop the stack with `Ctrl+C`, then remove the containers:

```bash
docker compose -f docker-compose.dev.yml down
```

PostgreSQL data stays in the `portfolio-db-dev` Docker volume. `down -v` also deletes that development database volume; never use it casually, and never use it in production.

If `.env` is missing `ADMIN_PASSWORD_HASH`, Compose stops before starting containers and prints the hash-generation command. It never substitutes a default password.

The API applies versioned additive migrations at startup and seeds project rows only when the collection is empty. Session tokens are opaque and only their HMAC hashes are stored. The collection update uses an ETag and returns `409` for stale edits. The database health check is read-only; credential rotation must be coordinated separately.

The Next.js build scrubs its generated Server Action keys and preview signing/encryption keys from `.next` artifacts. It retains Next.js's generated `previewModeId` because Vercel uses it as the prerender bypass token and requires at least 32 characters. The web entrypoint creates fresh runtime keys before starting Next.js. If Server Actions are introduced or the web tier is scaled across replicas, set one shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` through the runtime secret store for all replicas.

| Script                     | Purpose                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`              | Start the Next.js development server                                           |
| `npm run api`              | Start the Express API (requires PostgreSQL and environment variables)          |
| `npm start`                | Start the production Next.js server                                            |
| `npm run build`            | Create an optimized Next.js production build                                   |
| `npm test`                 | Run unit and static regression tests                                           |
| `npm run test:integration` | Run the disposable integration/smoke stack                                     |
| `npm run test:browser`     | Run the disposable browser security suite                                      |
| `npm run test:smoke`       | Run smoke checks against a disposable production-mode stack                    |
| `npm run verify`           | Run formatting, lint, type checks, duplicate/artifact checks, tests, and build |

Set `PORT` in `.env` to change the published web port.

### Developer Mode

The hidden Developer link in the footer opens `/developer`. The dashboard requires the Express server and the server-side environment variables above:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Use a dedicated password for this portfolio; Google account passwords are never used. The dashboard uses an HTTP-only, secure-in-HTTPS opaque session cookie and CSRF protection. Existing projects are seeded into PostgreSQL on first startup, and later edits are persisted without rebuilding the frontend.

The project editor keeps the form focused on six fields: **Title**, **Logo**, **Description**, **Tech usage**, **Live link**, and **GitHub link**. A logo is uploaded over the authenticated `POST /api/uploads` endpoint, checked for an allowed image type, magic bytes, and the 2 MB limit, then stored under a random filename on the `portfolio-uploads` volume (`portfolio-uploads-dev` in development). The public portfolio displays the saved image through the same-origin `/api/uploads/...` route. Editing preserves card metadata that is not shown in the six-field form, retains the existing project ID instead of adding a duplicate, and stores the result in PostgreSQL. Saving a new or updated project refreshes the Projects section from `GET /api/public-projects`.

Each project row shows its position, an accessible drag handle, Edit, Move up, and Move down. Reorder by dragging the handle or, without a mouse, by using Move up/Move down. The controls never start a drag, the first and last boundary controls are disabled, and each reorder is announced through the dashboard status message. Choose **Save order** to persist the complete list; the order is written to PostgreSQL `sort_order` and the public portfolio uses the same order after the save. The save uses the existing authenticated `PUT /api/projects` endpoint with the current CSRF token and `If-Match` ETag. If another session changed the collection first, the save returns `409` and the dashboard loads the latest server order for review instead of silently overwriting it. Leaving with an unsaved order, including signing out, asks for confirmation.

---

## Security

The detailed policy, header ownership, migration/rollback procedure, rotation steps, and remaining risks are in [`docs/security.md`](docs/security.md).

Key controls:

- Production mode is fail-closed and cannot be downgraded by `APP_ENV`. Production requires HTTPS termination, HTTPS-only trusted origins, a strong Argon2id hash, strong session and database secrets, and a bounded `TRUST_PROXY_HOPS`.
- Page CSP is nonce-based with `strict-dynamic`; `script-src` never allows `unsafe-inline`. Page, static, and API headers have one owner each to avoid conflicting policies.
- Session cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` in production. Only HMAC session references are stored. CSRF tokens, Origin checks, ETag concurrency, login rate limiting, and audit records protect mutations.
- Repository HTML goes through the documented trusted-file boundary; project and admin data enter the DOM through `textContent` and validated URLs.
- Migrations are transactional, advisory-locked, additive, and idempotent. There is no destructive down migration; roll back application code and leave the additive schema.
- Credential rotation: treat every former `.env` value as exposed, update the database role and deployment secret store together, restart API instances, and verify a fresh admin login. Changing `SESSION_SECRET` invalidates existing sessions.

Secret scanning runs in CI with Gitleaks. This checkout also uses `.githooks/pre-commit`; install Gitleaks locally for the hook, and configure the checkout hook path with `git config core.hooksPath .githooks` (already configured in this workspace).

---

## Testing

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

`check:compose` validates both Compose files with generated test-only values. It checks required production variables, insecure HTTPS/origin settings, environment downgrade rejection, distinct volume names, and development localhost defaults without printing secrets. `test:dev` starts the real `docker-compose.dev.yml` profile with a disposable tmpfs database, generated test-only credentials, and a unique project name; it verifies `/`, `/developer`, `/api/public-projects`, login cookie flags, CSRF, logout revocation, readiness, logs, and graceful shutdown.

The integration, browser, smoke, and dev commands create disposable Docker Compose projects with generated test-only credentials. They do not touch production volumes. Integration and smoke exercise the production configuration over HTTP with an explicit HTTPS test origin; browser and dev checks use explicit development configuration so HTTP assets load without `upgrade-insecure-requests`.

The integration suite checks routes, headers, CSP, authentication, session expiry, CSRF/Origin rejection, ETag conflicts, audit records, ordering persistence and rollback, logo upload authentication/type/magic-byte/size checks, upload serving and caching, rate limiting, secret-free logs, readiness failure, and graceful shutdown. The browser suite checks CSP violations, trusted-script execution, modal behaviour with malicious project text, admin CSRF/stale-write/revocation/logout behaviour, the six-field project editor, logo upload and public display, edit-without-duplication, validation messages, drag and keyboard ordering, public order persistence, mobile layout, and absence of test secrets in the DOM, storage, and loaded scripts.

---

## Deployment

Two topologies are supported:

1. **Managed (recommended for this repository):** Vercel for the Next.js frontend (including `/developer`), Render for the Express API Web Service, and Neon for PostgreSQL.
2. **Self-hosted:** Docker Compose on a host with persistent PostgreSQL storage.

The browser always calls relative `/api/...` paths. Vercel rewrites those paths server-side to the Render API using `API_INTERNAL_URL`; the API origin is never placed in the browser bundle.

### Managed deployment: Render + Neon + Vercel

#### 1. Create the Neon database

1. Create a Neon project and database.
2. Open **Connect**, turn **connection pooling off**, and copy the **direct** connection string. The migration runner uses a session-level PostgreSQL advisory lock, which transaction pooling cannot guarantee.
3. Ensure the string includes `sslmode=require` (or `verify-full`). The production validator rejects a `-pooler` hostname and a URL without TLS.
4. Store the value only as the Render secret `DATABASE_URL`. Never commit it or paste it into logs, tickets, or this README.

The API validates the URL shape at startup and fails with a generic `configuration_error`; it never logs the connection string or password.

#### 2. Create the Render API Web Service

| Setting            | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| Environment        | Node                                                      |
| Build command      | `npm ci --omit=dev`                                       |
| Start command      | `npm run api`                                             |
| Health check path  | `/api/ready`                                              |
| Persistent disk    | Mount at `/var/data/uploads` and set `UPLOAD_DIR` to match |

Render injects `PORT`. The API honors `PORT` first, then `API_PORT`, then `4000`, and always binds `0.0.0.0`. Do not hardcode a Render port.

Set these environment variables on the Render service (names only; supply real values through Render secrets):

```dotenv
NODE_ENV=production
APP_ENV=production
HTTPS_TERMINATED=true
TRUSTED_ORIGINS=https://your-vercel-production-origin.example
TRUST_PROXY_HOPS=1
DATABASE_URL=<direct Neon URL with sslmode=require>
ADMIN_EMAIL=<real admin email>
ADMIN_PASSWORD_HASH=<real Argon2id hash>
SESSION_SECRET=<real random base64url secret>
UPLOAD_DIR=/var/data/uploads
```

`TRUST_PROXY_HOPS` must match the exact proxy chain in front of the API. Start with `1` for a single Render Web Service, then verify with request logs and headers; do not guess. Trusted origins must be exact HTTPS origins. Do not add wildcards or arbitrary `*.vercel.app` origins.

#### 3. Configure Vercel

1. Import the repository as a Next.js project.
2. Set `API_INTERNAL_URL` to the Render service origin, for example `https://your-render-service.onrender.com`. It is server-side only. A trailing slash is accepted and normalized. Do not create `NEXT_PUBLIC_API_URL`.
3. Set `HTTPS_TERMINATED=true`.
4. Redeploy after any environment-variable change. Next.js resolves the rewrite destination when the deployment starts, so an existing deployment does not pick up new values automatically.
5. The production developer dashboard is `https://your-vercel-app.vercel.app/developer`. Replace the example host with your real Vercel production origin.

Vercel preview deployments use different origins. The default configuration accepts only the exact production origin, so admin login from a preview URL is rejected. If preview login is required, create a separate preview backend/configuration with its own `TRUSTED_ORIGINS` and `API_INTERNAL_URL`; never widen the production origin to a wildcard.

#### 4. Upload persistence

Render's ordinary filesystem is ephemeral and is lost on deploys and restarts. Attach a Render persistent disk at the exact upload directory and set `UPLOAD_DIR` to that absolute path. Creating the directory alone is not persistence. `/api/ready` returns `503` when the upload directory is missing or not writable, so a health check failure after deployment usually means the disk is not mounted.

Do not delete the disk or the database while rotating credentials or redeploying. Back up Neon before schema changes.

#### 5. Post-deployment verification

```bash
curl -fsS https://your-render-service.onrender.com/api/health
curl -fsS https://your-render-service.onrender.com/api/ready
curl -fsS https://your-vercel-app.vercel.app/api/public-projects
curl -fsS https://your-vercel-app.vercel.app/
```

In a browser, open the Vercel production URL and `/developer`, sign in with the configured admin account, confirm the session cookie is `Secure`, `HttpOnly`, and `SameSite=Strict`, upload a logo, redeploy the Render service, and confirm the logo still loads from `/api/uploads/...`.

### Self-hosted Docker Compose

Deploy with Docker Compose on a host that can run containers and persistent PostgreSQL storage. Use `docker-compose.yml`, never `docker-compose.dev.yml`. The production file publishes only the web port; the API and database stay on the internal network.

### Required production configuration

Set every value through the hosting platform or secret manager, not a committed file:

```dotenv
NODE_ENV=production
APP_ENV=production
HTTPS_TERMINATED=true
TRUSTED_ORIGINS=https://your-real-domain.example
ADMIN_EMAIL=valid-mailbox@your-real-domain.example
ADMIN_PASSWORD_HASH='<generated Argon2id hash>'
SESSION_SECRET='<random base64url value, at least 43 characters>'
POSTGRES_PASSWORD='<unique strong value, at least 24 bytes>'
TRUST_PROXY_HOPS=1
UPLOAD_DIR=/app/uploads
```

Missing values fail before containers start. `HTTPS_TERMINATED=false`, an HTTP or localhost `TRUSTED_ORIGINS`, a weak hash/secret/password, or contradictory `NODE_ENV`/`APP_ENV` values fail the production configuration check. `NODE_ENV=production` cannot be downgraded by `APP_ENV=development`.

### Validate and start

`docker compose config -q` validates interpolation without printing resolved secrets:

```bash
docker compose config -q
docker compose up --build -d
```

### Health and logs

```bash
docker compose ps
docker compose logs --tail=100 api web db
curl -fsS https://your-real-domain.example/api/health
curl -fsS https://your-real-domain.example/api/ready
```

`db`, `api`, and `web` must all report healthy. `/api/health` is a liveness check; `/api/ready` also verifies PostgreSQL connectivity and that the upload directory is writable. The directory check catches a missing or read-only mount, but it cannot prove the storage survives redeploys — only a named volume or persistent disk does that.

### TLS, DNS, and proxy requirements

Terminate TLS at a trusted proxy, point DNS at it, and have it overwrite `X-Forwarded-*` headers, including `X-Forwarded-Proto: https`. Set `TRUST_PROXY_HOPS` to the exact number of trusted proxies in front of `web`; do not guess. HSTS is emitted only when `NODE_ENV=production` and `HTTPS_TERMINATED=true`. Do not publish the API or database ports.

For multiple web replicas or Server Actions, set one shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for every replica. A single instance may let the entrypoint generate a runtime key.

### Secret rotation

Treat every value ever present in a local `.env`, shell history, or old deployment as exposed. Generate new database, session, admin, and action-key values with the commands in [`docs/security.md`](docs/security.md), update the database role and secret store together, restart the API, and verify a fresh admin login. Changing `SESSION_SECRET` invalidates existing sessions. Never paste old or new values into tickets, logs, or this repository.

### Backup, restore, and shutdown

Take a verified PostgreSQL backup before upgrades. Restore only into a maintenance window after confirming the target volume. Stop the stack safely with:

```bash
docker compose down
```

Never use `docker compose down -v` in production; it deletes the PostgreSQL volume. Static-only hosting does not run the Express API or database.

---

## Customization Guide

**Content** — all copy lives directly in `index.html` as plain text inside each `<section>`. Sections are anchored as `#home`, `#about`, `#skills`, `#experience`, `#projects`, `#education`, `#contact`.

**Colors, fonts, spacing** — edit the `:root` tokens at the top of `css/style.css`, then mirror any change into the `:root[data-theme="light"]` override block.

**Photo and résumé** — replace `assets/profile.jpg` and `assets/resume.pdf` in place, or update the `src`/`href` in `index.html`. If the image fails to load, a built-in fallback handler substitutes a monogram (section 14 of `js/script.js`).

**Projects** — use the hidden Developer Mode link in the portfolio footer, sign in, and manage the six project fields (Title, Logo, Description, Tech usage, Live link, and GitHub link) from the dashboard. Logos are stored on the upload volume and served from `/api/uploads/...`. Drag a project by its handle or use Move up/Move down, then choose **Save order**; the saved order is stored in PostgreSQL and shown on the public portfolio. Updates are stored in PostgreSQL.

**Audio tuning** — adjust master volume at `js/script.js:145`; voice balance at `js/script.js:71`; chime density in `ambientStep()`.

---

## Browser Support

| Browser                  | Support                                         |
| ------------------------ | ----------------------------------------------- |
| Chrome / Edge (Chromium) | Full                                            |
| Firefox                  | Full                                            |
| Safari / iOS Safari      | Full, including `backdrop-filter` and Web Audio |
| Legacy Edge (EdgeHTML)   | Not supported                                   |

The layout is responsive from 320px upward, with a dedicated mobile navigation drawer and stacked grids on small screens.

---

## Accessibility

- Skip-to-content link as the first focusable element
- Semantic landmarks and a logical heading hierarchy
- `aria-label` and `aria-expanded` on interactive controls, with state exposed through accessible names
- Visible `:focus-visible` focus rings across the UI
- Toast region is `aria-live="polite"`, so announcements never interrupt
- Decorative layers (canvas, grid, orbs, cursor glow) are `aria-hidden="true"`
- Full `prefers-reduced-motion` support — animations and transitions collapse to ~0ms, card transforms are disabled, and the ambient canvas is removed from the render tree entirely
- Color tokens are checked for contrast in both themes

---

## Performance

- **Server-rendered content** — portfolio markup is delivered with the initial page response
- Production Next.js build with compressed responses and small route-specific JavaScript
- Fonts loaded with `preconnect` + `display=swap`
- Animations use `transform` and `opacity` (compositor-friendly), avoiding layout thrash
- Scroll and reveal effects use IntersectionObserver rather than scroll-event handlers
- Audio nodes are explicitly disconnected after use, so long sessions stay stable

---

## Known Limitations

- **Audio autoplay depends on browser policy.** The site attempts playback on load and starts on the first trusted interaction when the browser blocks autoplay.
- **UI sound effects bypass the music master gain.** They connect directly to `audioCtx.destination`, so music volume changes do not affect click/flip/modal sounds.
- **Theme preference only.** Audio state and filter selections reset on reload.
- **Static-only hosting is unsupported for the dashboard.** Run the Docker Compose stack to provide the API and persistent database.

---

## Author

**Hafijur Rahman Bhuiyan** — Software Engineer & Full-Stack Developer
React · TypeScript · Node.js · Django · PostgreSQL · AI/ML

- GitHub: [github.com/HafijurRahmanBhuiyan](https://github.com/HafijurRahmanBhuiyan)
- LinkedIn: [linkedin.com/in/hafijur-rahman-bhuiyan](https://www.linkedin.com/in/hafijur-rahman-bhuiyan)

---

## License

Released for personal portfolio use. All rights reserved.
