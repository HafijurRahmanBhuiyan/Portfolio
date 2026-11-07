import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTrustedBody } from '../lib/trusted-html.js';
import { compareDuplicates } from '../scripts/check-duplicates.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('trusted HTML extraction removes executable content', () => {
  const source = `<!doctype html><html><body>
    <h1 onclick="alert(1)">Title</h1>
    <a href="javascript:alert(2)">bad</a>
    <img src="x" onerror="alert(3)">
    <script>window.__xss = 1;</script>
    <p>Keep me</p>
  </body></html>`;
  const body = extractTrustedBody(source, 'fixture.html');
  assert.match(body, /Keep me/);
  assert.doesNotMatch(body, /<script/i);
  assert.doesNotMatch(body, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(body, /javascript:/i);
});

test('repository pages contain no executable body content', () => {
  for (const file of ['index.html', 'developer.html']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const body = extractTrustedBody(source, file);
    assert.doesNotMatch(body, /<script/i, file);
    assert.doesNotMatch(body, /\son[a-z]+\s*=/i, file);
    assert.doesNotMatch(body, /javascript:/i, file);
  }
});

test('pages use the documented trusted-file boundary', () => {
  for (const file of ['app/page.js', 'app/developer/page.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /extractTrustedBody/, file);
    assert.match(source, /Trusted-file boundary/, file);
  }
});

test('project data enters the DOM through textContent, not HTML sinks', () => {
  const source = fs.readFileSync(path.join(root, 'js/projects.js'), 'utf8');
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
});

test('all modal branches are DOM-built and CSP-safe', () => {
  const source = fs.readFileSync(path.join(root, 'js/script.js'), 'utf8');
  assert.doesNotMatch(source, /onclick\s*=/);
  assert.doesNotMatch(source, /modalBody\.innerHTML/);
  assert.doesNotMatch(source, /frontHtml|backHtml/);
  assert.match(source, /currentCardData\.frontNode/);
  assert.match(source, /currentCardData\.backNode/);
  assert.match(source, /data-close-modal/);
  assert.match(source, /textContent/);
});

test('source and public security-sensitive copies do not drift', () => {
  assert.deepEqual(compareDuplicates(root), []);
});
