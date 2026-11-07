import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import pg from 'pg';

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const origin = process.env.SMOKE_ORIGIN || new URL(baseURL).origin;
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || '';
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || '';
const sessionSecret = process.env.SMOKE_SESSION_SECRET || '';
const databaseUrl = process.env.SMOKE_DATABASE_URL || '';

test.describe.configure({ mode: 'serial' });

let api;
let csrfToken = '';
let originalProjects = null;

function secrets() {
  return [adminPassword, sessionSecret, databaseUrl].filter(
    (value) => typeof value === 'string' && value.length >= 8,
  );
}

async function getProjects() {
  const response = await api.get('/api/projects', {
    headers: { Origin: origin },
  });
  expect(response.status(), 'authenticated project read').toBe(200);
  return {
    etag: response.headers().etag,
    csrf: response.headers()['x-csrf-token'],
    projects: await response.json(),
  };
}

async function putProjects(projects, etag) {
  return api.put('/api/projects', {
    headers: {
      Origin: origin,
      'X-CSRF-Token': csrfToken,
      'If-Match': etag,
    },
    data: projects,
  });
}

async function restoreOriginalProjects() {
  if (!originalProjects) return;
  const current = await getProjects();
  if (JSON.stringify(current.projects) === JSON.stringify(originalProjects))
    return;
  const response = await putProjects(originalProjects, current.etag);
  expect(response.status(), 'restore original project collection').toBe(200);
}

async function preparePage(page) {
  await page.addInitScript(() => {
    window.__xss = undefined;
    window.__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        directive: event.violatedDirective,
        blockedURI: event.blockedURI,
      });
    });
  });
}

async function waitForPortfolio(page) {
  await page.goto('/');
  await expect(page.locator('#portfolio-root')).toBeVisible();
  await page.waitForFunction(
    () => typeof window.openCardIn3D === 'function',
    undefined,
    { timeout: 30_000 },
  );
}

async function loginAdmin(page) {
  await page.goto('/developer');
  await page.fill('#loginForm input[name="email"]', adminEmail);
  await page.fill('#loginForm input[name="password"]', adminPassword);
  await page.locator('#loginForm button').click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#loginPanel')).toBeHidden();
  await expect(page.locator('#projectList .project-row').first()).toBeVisible();
}

async function rowTitles(page) {
  return page.locator('#projectList .project-title').allTextContents();
}

async function rowPositions(page) {
  return page.locator('#projectList .position-value').allTextContents();
}

async function expectModalClosed(page) {
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'true',
    { timeout: 5_000 },
  );
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe('');
}

function scriptDirective(csp) {
  const match = /(?:^|;\s*)script-src([^;]*)/i.exec(csp || '');
  return match ? match[1] : '';
}

test.beforeAll(async ({ playwright }) => {
  expect(adminEmail, 'SMOKE_ADMIN_EMAIL').not.toBe('');
  expect(adminPassword, 'SMOKE_ADMIN_PASSWORD').not.toBe('');
  expect(sessionSecret, 'SMOKE_SESSION_SECRET').not.toBe('');
  expect(databaseUrl, 'SMOKE_DATABASE_URL').not.toBe('');

  api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: origin },
  });
  const login = await api.post('/api/login', {
    data: { email: adminEmail, password: adminPassword },
  });
  expect(login.status(), 'test API login').toBe(200);
  csrfToken = (await login.json()).csrfToken;
  expect(typeof csrfToken).toBe('string');

  const snapshot = await getProjects();
  originalProjects = snapshot.projects;
});

test.afterAll(async () => {
  try {
    await restoreOriginalProjects();
  } finally {
    if (api) await api.dispose();
  }
});

test('pages send a nonce-based CSP and execute only trusted scripts', async ({
  page,
}) => {
  await preparePage(page);

  const home = await page.goto('/');
  const csp = home.headers()['content-security-policy'] || '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/);
  expect(scriptDirective(csp)).not.toContain("'unsafe-inline'");

  await expect(page.locator('#portfolio-root')).toBeVisible();
  await page.waitForFunction(
    () => typeof window.openCardIn3D === 'function',
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);

  const developer = await page.goto('/developer');
  const developerCsp = developer.headers()['content-security-policy'] || '';
  expect(developerCsp).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(scriptDirective(developerCsp)).not.toContain("'unsafe-inline'");
  await expect(page.locator('#loginForm')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test('modal opens, flips, resets, closes by button, Escape, backdrop, and safe links', async ({
  page,
}) => {
  await preparePage(page);
  await waitForPortfolio(page);

  const fact = page.locator('.fact.card-3d').first();
  await fact.click();
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await expect(page.locator('#modalBody .modal-title')).toHaveText('Location');
  await expect(page.locator('#modalBody .modal-meta-kicker')).toHaveText(
    'Key Information',
  );

  await page.locator('#modalFlipBtn').click();
  await expect(page.locator('#flipBtnText')).toHaveText('Flip to Overview');
  await expect(page.locator('#modalBody .modal-meta-kicker')).toHaveText(
    'Profile Overview',
  );
  await page.locator('#modalResetBtn').click();
  await expect(page.locator('#flipBtnText')).toHaveText(
    'Architecture Blueprint',
  );
  await expect(page.locator('#modalBody .modal-meta-kicker')).toHaveText(
    'Key Information',
  );

  await page.locator('#modalCloseBtn').click();
  await expectModalClosed(page);

  await fact.click();
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await page.keyboard.press('Escape');
  await expectModalClosed(page);

  await fact.click();
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await page.locator('#card3DModal').click({ position: { x: 2, y: 2 } });
  await expectModalClosed(page);

  const project = page.locator('.pcard.card-3d').first();
  await project.locator('.pcard-details-btn').click();
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await expect(page.locator('#modalBody .modal-meta-kicker')).toHaveText(
    'Project · Selected Work',
  );
  await page.locator('#modalFlipBtn').click();
  await expect(page.locator('#modalBody .modal-meta-kicker')).toHaveText(
    'System Architecture & Implementation',
  );

  const externalLink = page.locator('#modalBody a[href^="http"]').first();
  await expect(externalLink).toHaveAttribute('target', '_blank');
  await expect(externalLink).toHaveAttribute('rel', /noopener noreferrer/);
  expect(await page.locator('#modalBody a[href^="javascript:"]').count()).toBe(
    0,
  );

  await page.locator('#modalCloseBtn').click();
  await expectModalClosed(page);

  // Links marked data-close-modal dismiss the modal without inline handlers.
  await fact.click();
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await page.locator('#modalBody [data-close-modal]').first().click();
  await expectModalClosed(page);
});

test('malicious project values render as text and never execute in the modal', async ({
  page,
}) => {
  const snapshot = await getProjects();
  const payload = {
    ...snapshot.projects[0],
    categories: 'ai',
    title: '<img src=x onerror="window.__xss=1">Malicious Title',
    subtitle: '<svg onload="window.__xss=2">',
    description: '<script>window.__xss=3</script>Literal description',
    tags: ['<b>tag</b>', '<img src=x onerror="window.__xss=4">'],
    imageAlt: '"><script>window.__xss=5</script>',
    url: '<script>window.__xss=6</script>',
    status: '<img src=x onerror="window.__xss=7">',
  };
  const updated = await putProjects(
    [payload, ...snapshot.projects.slice(1)],
    snapshot.etag,
  );
  expect(updated.status(), 'store malicious-looking project values').toBe(200);

  await preparePage(page);
  await waitForPortfolio(page);
  await expect(page.locator('.project-grid .pcard h3').first()).toContainText(
    'Malicious Title',
  );
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  await page
    .locator('.project-grid .pcard')
    .first()
    .locator('.pcard-details-btn')
    .click();
  await expect(page.locator('#card3DModal')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await expect(page.locator('#modalBody .modal-title')).toHaveText(
    '<img src=x onerror="window.__xss=1">Malicious Title',
  );
  await expect(page.locator('#modalBody .modal-desc')).toContainText(
    '<script>window.__xss=3</script>Literal description',
  );
  await expect(page.locator('#modalBody .tag').first()).toHaveText(
    '<b>tag</b>',
  );
  expect(await page.locator('#modalBody img[src="x"]').count()).toBe(0);
  expect(await page.locator('#modalBody script').count()).toBe(0);
  expect(await page.locator('#modalBody a[href^="javascript:"]').count()).toBe(
    0,
  );
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  await page.keyboard.press('Escape');
  await expectModalClosed(page);
  await restoreOriginalProjects();
});

test('admin UI enforces CSRF, handles stale writes and revoked sessions, and logs out', async ({
  page,
  context,
}) => {
  await preparePage(page);
  await page.goto('/developer');
  await page.fill('#loginForm input[name="email"]', adminEmail);
  await page.fill('#loginForm input[name="password"]', adminPassword);
  await page.locator('#loginForm button').click();

  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#loginPanel')).toBeHidden();
  await expect(page.locator('#projectList .project-row').first()).toBeVisible();

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === 'dev_session');
  expect(sessionCookie, 'session cookie is set').toBeTruthy();
  expect(sessionCookie.httpOnly).toBe(true);
  expect(sessionCookie.sameSite).toBe('Strict');
  expect(sessionCookie.secure).toBe(false);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'dev_session',
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    sessionCookie.value,
  );

  const unverifiedStatus = await page.evaluate(async () => {
    const response = await fetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '[]',
    });
    return response.status;
  });
  expect(unverifiedStatus).toBe(403);

  const snapshot = await getProjects();
  const externalPayload = snapshot.projects.map((project, index) =>
    index === 0
      ? { ...project, title: `${project.title} (external update)` }
      : project,
  );
  const external = await putProjects(externalPayload, snapshot.etag);
  expect(external.status(), 'external project update').toBe(200);
  const externalEtag = external.headers().etag;
  expect(externalEtag).toBeTruthy();

  await page
    .locator('#projectList .project-row')
    .first()
    .locator('.edit-project')
    .click();
  await page.fill('#projectForm input[name="title"]', 'Stale UI edit');
  await page.locator('#projectForm button.btn-primary').click();
  await expect(page.locator('#message')).toContainText(
    /changed in another session/i,
  );
  await expect(page.locator('#projectList .project-row').first()).toContainText(
    '(external update)',
  );

  const restore = await putProjects(originalProjects, externalEtag);
  expect(restore.status(), 'restore after conflict').toBe(200);

  const token = decodeURIComponent(sessionCookie.value);
  const tokenHash = crypto
    .createHmac('sha256', sessionSecret)
    .update(token)
    .digest('hex');
  const db = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const revoked = await db.query(
      'UPDATE admin_sessions SET revoked=true WHERE token_hash=$1',
      [tokenHash],
    );
    expect(revoked.rowCount, 'revoke the browser session').toBe(1);
  } finally {
    await db.end();
  }

  await page
    .locator('#projectList .project-row')
    .first()
    .locator('.edit-project')
    .click();
  await page.fill('#projectForm input[name="title"]', 'After revoke');
  await page.locator('#projectForm button.btn-primary').click();
  await expect(page.locator('#loginPanel')).toBeVisible();
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#message')).toContainText(/sign in again/i);

  await page.fill('#loginForm input[name="email"]', adminEmail);
  await page.fill('#loginForm input[name="password"]', adminPassword);
  await page.locator('#loginForm button').click();
  await expect(page.locator('#dashboard')).toBeVisible();
  const freshCookies = await context.cookies();
  const freshCookie = freshCookies.find(
    (cookie) => cookie.name === 'dev_session',
  );
  expect(freshCookie, 'fresh session cookie').toBeTruthy();
  const freshHash = crypto
    .createHmac('sha256', sessionSecret)
    .update(decodeURIComponent(freshCookie.value))
    .digest('hex');

  // The form is still dirty from the revoked-session attempt, so the UI asks
  // for confirmation before discarding unsaved changes and signing out.
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#logout').click();
  await expect(page.locator('#loginPanel')).toBeVisible();
  await expect(page.locator('#dashboard')).toBeHidden();

  const afterLogout = await context.cookies();
  const cleared = afterLogout.find((cookie) => cookie.name === 'dev_session');
  expect(cleared?.value || '').toBe('');

  const verifyDb = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await verifyDb.query(
      'SELECT revoked FROM admin_sessions WHERE token_hash=$1',
      [freshHash],
    );
    expect(result.rows[0]?.revoked, 'logout revokes the server session').toBe(
      true,
    );
  } finally {
    await verifyDb.end();
  }
});

test('project editor has six fields, validates input, and uploads logos without duplication', async ({
  page,
}) => {
  await preparePage(page);
  await loginAdmin(page);

  const fieldNames = await page
    .locator(
      '#projectForm input:not([type="hidden"]), #projectForm textarea, #projectForm select',
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.name).filter(Boolean),
    );
  expect(fieldNames.sort()).toEqual([
    'description',
    'github',
    'live',
    'logo',
    'techUsage',
    'title',
  ]);
  for (const removed of [
    'subtitle',
    'categories',
    'tags',
    'image',
    'imageAlt',
    'url',
    'status',
  ])
    await expect(page.locator(`#projectForm [name="${removed}"]`)).toHaveCount(
      0,
    );

  await page.locator('#projectForm button.btn-primary').click();
  await expect(page.locator('#message')).toHaveText('Enter a project title.');
  await expect(page.locator('#message')).toHaveAttribute('data-state', 'error');

  await page.setInputFiles('#logoInput', {
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await expect(page.locator('#message')).toHaveText(
    'Choose a PNG, JPG, WebP, or GIF image.',
  );

  const title = `Integration Upload ${Date.now()}`;
  const updatedTitle = `${title} Updated`;
  await page.fill('#projectForm input[name="title"]', title);
  await page.fill(
    '#projectForm textarea[name="description"]',
    'A project created by the browser regression suite.',
  );
  await page.fill(
    '#projectForm input[name="techUsage"]',
    'React, Docker, PostgreSQL',
  );
  await page.fill(
    '#projectForm input[name="live"]',
    'https://example.com/project',
  );
  await page.fill(
    '#projectForm input[name="github"]',
    'https://github.com/example/project',
  );
  await page.setInputFiles('#logoInput', {
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('#logoPreview')).toBeVisible();
  await expect(page.locator('#logoPreviewText')).toContainText('logo.png');
  expect(
    await page.evaluate(() => window.__cspViolations),
    'logo preview respects the page CSP',
  ).toEqual([]);

  await page.locator('#projectForm button.btn-primary').click();
  await expect(page.locator('#message')).toHaveText(
    'Project saved. It now appears on your portfolio.',
  );
  await expect(page.locator('#message')).toHaveAttribute(
    'data-state',
    'success',
  );
  await expect(page.locator('#projectList .project-title').last()).toHaveText(
    title,
  );
  await expect(page.locator('#projectForm input[name="id"]')).toHaveValue('');
  await expect(page.locator('#logoPreview')).toBeHidden();

  const afterAdd = await getProjects();
  const added = afterAdd.projects.find((project) => project.title === title);
  expect(added, 'new project stored in PostgreSQL').toBeTruthy();
  expect(added.subtitle).toBe('Project');
  expect(added.tags).toEqual(['React', 'Docker', 'PostgreSQL']);
  expect(added.live).toBe('https://example.com/project');
  expect(added.github).toBe('https://github.com/example/project');
  expect(added.url).toBe('example.com');
  expect(added.status).toBe('Live');
  expect(added.image).toMatch(/^api\/uploads\/[0-9a-f]{32}\.png$/);
  const projectCount = afterAdd.projects.length;

  await waitForPortfolio(page);
  const publicCard = page
    .locator('.project-grid .pcard')
    .filter({ hasText: title });
  await expect(publicCard).toHaveCount(1);
  await expect(publicCard.locator('h3')).toHaveText(title);
  await expect(publicCard.locator('.pcard-logo img')).toHaveAttribute(
    'src',
    /api\/uploads\/[0-9a-f]{32}\.png$/,
  );
  const logoSrc = await publicCard
    .locator('.pcard-logo img')
    .getAttribute('src');
  const logoResponse = await api.get(
    logoSrc.startsWith('/') ? logoSrc : `/${logoSrc}`,
  );
  expect(logoResponse.status(), 'uploaded logo is served').toBe(200);
  expect(logoResponse.headers()['content-type']).toBe('image/png');
  expect(
    Buffer.compare(
      await logoResponse.body(),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=',
        'base64',
      ),
    ),
  ).toBe(0);

  await page.goto('/developer');
  await expect(page.locator('#dashboard')).toBeVisible();
  await page
    .locator('#projectList .project-row')
    .filter({ hasText: title })
    .locator('.edit-project')
    .click();
  await expect(page.locator('#projectForm input[name="id"]')).toHaveValue(
    added.id,
  );
  await expect(page.locator('#logoPreviewText')).toHaveText('Current logo');
  await page.fill('#projectForm input[name="title"]', updatedTitle);
  await page.fill(
    '#projectForm textarea[name="description"]',
    'Updated description for the same project.',
  );
  await page.fill('#projectForm input[name="techUsage"]', 'React, Docker');
  await page.locator('#projectForm button.btn-primary').click();
  await expect(page.locator('#message')).toHaveText(
    'Project saved. It now appears on your portfolio.',
  );

  const afterEdit = await getProjects();
  expect(
    afterEdit.projects.length,
    'editing updates instead of duplicating',
  ).toBe(projectCount);
  expect(
    afterEdit.projects.filter((project) => project.id === added.id),
  ).toHaveLength(1);
  const edited = afterEdit.projects.find((project) => project.id === added.id);
  expect(edited.title).toBe(updatedTitle);
  expect(edited.description).toBe('Updated description for the same project.');
  expect(edited.tags).toEqual(['React', 'Docker']);
  expect(edited.image, 'existing logo is kept when no new file is chosen').toBe(
    added.image,
  );
  expect(afterEdit.projects.some((project) => project.title === title)).toBe(
    false,
  );

  await waitForPortfolio(page);
  await expect(
    page.locator('.project-grid .pcard h3').filter({ hasText: updatedTitle }),
  ).toHaveCount(1);
  await expect(
    page
      .locator('.project-grid .pcard')
      .filter({ hasText: updatedTitle })
      .locator('.pcard-logo img'),
  ).toHaveAttribute('src', /api\/uploads\/[0-9a-f]{32}\.png$/);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);

  await restoreOriginalProjects();
});

test('developer ordering: drag, keyboard, save, public order, conflict, and safe text', async ({
  page,
}) => {
  await preparePage(page);
  await loginAdmin(page);

  const rows = page.locator('#projectList .project-row');
  const handles = page.locator('#projectList .drag-handle');
  expect(await handles.count()).toBeGreaterThanOrEqual(3);
  await expect(handles.first()).toHaveAttribute(
    'aria-label',
    /^Drag to reorder /,
  );

  const initialTitles = await rowTitles(page);
  const initialSnapshot = await getProjects();
  expect(initialSnapshot.projects.map((project) => project.title)).toEqual(
    initialTitles,
  );
  expect(await rowPositions(page)).toEqual(
    initialTitles.map((_, index) => String(index + 1)),
  );
  await expect(rows.first().locator('.move-up')).toBeDisabled();
  await expect(rows.last().locator('.move-down')).toBeDisabled();

  // Keyboard-only reorder: focus the last row's Move up and press Enter.
  const lastIndex = initialTitles.length - 1;
  await rows.nth(lastIndex).locator('.move-up').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#message')).toContainText(
    /Moved .* to position \d+/,
  );
  const afterKeyboard = await rowTitles(page);
  expect(afterKeyboard[lastIndex - 1]).toBe(initialTitles[lastIndex]);
  expect(afterKeyboard[lastIndex]).toBe(initialTitles[lastIndex - 1]);
  expect(
    await page.evaluate(() =>
      document.activeElement?.classList.contains('move-up'),
    ),
  ).toBe(true);
  await expect(page.locator('#orderStatus')).toHaveText(
    'Unsaved order changes.',
  );
  await expect(page.locator('#saveOrder')).toBeEnabled();

  // Leaving with an unsaved order asks for confirmation; dismissing keeps the
  // session and the pending order in place.
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#logout').click();
  await expect(page.locator('#dashboard')).toBeVisible();

  // Drag the first project after the third row, landing it at position 3.
  await handles.nth(0).dragTo(rows.nth(2), {
    targetPosition: { x: 10, y: 40 },
  });
  const afterDrag = await rowTitles(page);
  const expectedAfterDrag = afterKeyboard.slice();
  const draggedTitle = expectedAfterDrag.shift();
  expectedAfterDrag.splice(2, 0, draggedTitle);
  expect(afterDrag).toEqual(expectedAfterDrag);
  expect(await rowPositions(page)).toEqual(
    afterDrag.map((_, index) => String(index + 1)),
  );
  await expect(rows.first().locator('.move-up')).toBeDisabled();
  await expect(rows.last().locator('.move-down')).toBeDisabled();

  // Edit and Add new keep the pending order instead of silently discarding it.
  page.once('dialog', (dialog) => dialog.accept());
  await rows.first().locator('.edit-project').click();
  await expect(page.locator('#projectForm input[name="id"]')).not.toHaveValue(
    '',
  );
  await expect(page.locator('#orderStatus')).toHaveText(
    'Unsaved order changes.',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#newProject').click();
  await expect(page.locator('#projectForm input[name="id"]')).toHaveValue('');
  await expect(page.locator('#orderStatus')).toHaveText(
    'Unsaved order changes.',
  );
  expect(await rowTitles(page)).toEqual(afterDrag);
  await expect(page.locator('#saveOrder')).toBeEnabled();

  await page.locator('#saveOrder').click();
  await expect(page.locator('#message')).toHaveText('Project order saved.');
  await expect(page.locator('#orderStatus')).toHaveText(
    'Order matches saved projects.',
  );
  await expect(page.locator('#saveOrder')).toBeDisabled();

  const saved = await getProjects();
  expect(saved.projects.map((project) => project.title)).toEqual(afterDrag);
  const publicResponse = await api.get('/api/public-projects');
  expect(publicResponse.status()).toBe(200);
  expect((await publicResponse.json()).map((project) => project.title)).toEqual(
    afterDrag,
  );

  await page.goto('/');
  await expect(page.locator('.project-grid .pcard h3').first()).toHaveText(
    afterDrag[0],
  );
  expect(
    await page.locator('.project-grid .pcard h3').allTextContents(),
  ).toEqual(afterDrag);

  await page.goto('/developer');
  await expect(page.locator('#dashboard')).toBeVisible();
  expect(await rowTitles(page)).toEqual(afterDrag);
  await expect(page.locator('#saveOrder')).toBeDisabled();

  // An external write advances the ETag. Saving the stale local order must not
  // overwrite it; the UI reloads and displays the latest server state as text.
  const externalTitle = '<img src=x onerror="window.__xss=9">External order';
  const externalPayload = saved.projects.map((project, index) =>
    index === 0 ? { ...project, title: externalTitle } : project,
  );
  const external = await putProjects(externalPayload, saved.etag);
  expect(external.status(), 'external write before stale reorder').toBe(200);

  await page
    .locator('#projectList .project-row')
    .first()
    .locator('.move-down')
    .click();
  await expect(page.locator('#saveOrder')).toBeEnabled();
  await page.locator('#saveOrder').click();
  await expect(page.locator('#message')).toContainText(
    /changed in another session/i,
  );
  await expect(page.locator('#message')).toContainText(
    /latest order has been loaded/i,
  );
  await expect(page.locator('#projectList .project-title').first()).toHaveText(
    externalTitle,
  );
  expect(await page.locator('#projectList img').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator('#saveOrder')).toBeDisabled();
  await expect(page.locator('#orderStatus')).toHaveText(
    'Order matches saved projects.',
  );
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);

  await restoreOriginalProjects();
});

test('developer ordering controls remain usable on a mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await preparePage(page);
  await loginAdmin(page);

  await expect(page.locator('#saveOrder')).toBeVisible();
  const firstRow = page.locator('#projectList .project-row').first();
  await expect(firstRow.locator('.drag-handle')).toBeVisible();
  await expect(firstRow.locator('.edit-project')).toBeVisible();
  await expect(firstRow.locator('.move-down')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);

  const before = await rowTitles(page);
  await firstRow.locator('.move-down').click();
  await expect(page.locator('#message')).toContainText(
    /Moved .* to position 2/,
  );
  const after = await rowTitles(page);
  expect(after[0]).toBe(before[1]);
  expect(after[1]).toBe(before[0]);

  // Undo with the keyboard control so no order remains pending.
  await page
    .locator('#projectList .project-row')
    .nth(1)
    .locator('.move-up')
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#orderStatus')).toHaveText(
    'Order matches saved projects.',
  );
  expect(await rowTitles(page)).toEqual(before);
});

test('test secrets are absent from rendered HTML, storage, and loaded scripts', async ({
  page,
}) => {
  await preparePage(page);
  await waitForPortfolio(page);

  const forbidden = secrets();
  expect(forbidden.length).toBeGreaterThanOrEqual(3);

  const html = await page.content();
  const storage = await page.evaluate(() => {
    const values = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      values.push(key, localStorage.getItem(key));
    }
    return JSON.stringify({ values, cookie: document.cookie });
  });
  for (const secret of forbidden) {
    expect(html, 'rendered HTML').not.toContain(secret);
    expect(storage, 'browser storage and readable cookies').not.toContain(
      secret,
    );
  }

  const scripts = await page.$$eval('script[src]', (elements) =>
    elements.map((element) => element.src),
  );
  for (const source of scripts) {
    const response = await page.request.get(source);
    expect(response.ok(), `loaded script ${source}`).toBe(true);
    const body = await response.text();
    for (const secret of forbidden)
      expect(body, `script ${source}`).not.toContain(secret);
  }
});
