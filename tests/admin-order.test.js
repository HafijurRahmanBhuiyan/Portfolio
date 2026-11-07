import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const adminSource = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
const developerHtml = fs.readFileSync(
  path.join(root, 'developer.html'),
  'utf8',
);

// The admin dashboard is a classic browser script, so it cannot be imported as
// a module. Extract the marker-delimited pure helpers and evaluate exactly the
// code the browser runs; no DOM or network access is involved.
const start = adminSource.indexOf('/* --- order helpers');
const end = adminSource.indexOf('/* --- end order helpers --- */');
assert.ok(start >= 0 && end > start, 'order helper markers are present');
const helpers = new Function(
  adminSource.slice(start, end) +
    '; return { cloneList, sameOrder, moveItem, reorderById };',
)();

function projects(...ids) {
  return ids.map((id) => ({ id, title: `Project ${id}`, tags: [`tag-${id}`] }));
}

function ids(list) {
  return list.map((project) => project.id);
}

test('moving an item up or down produces the expected array order', () => {
  const original = projects('a', 'b', 'c', 'd');
  assert.deepEqual(ids(helpers.moveItem(original, 0, 2)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(helpers.moveItem(original, 3, 1)), ['a', 'd', 'b', 'c']);
  assert.deepEqual(ids(original), ['a', 'b', 'c', 'd']);
});

test('moving beyond the first or last boundary is a no-op', () => {
  const original = projects('a', 'b', 'c');
  assert.equal(helpers.moveItem(original, 0, -1), original);
  assert.equal(helpers.moveItem(original, 2, 3), original);
  assert.equal(helpers.moveItem(original, -1, 0), original);
  assert.equal(helpers.moveItem(original, 3, 0), original);
  assert.equal(helpers.moveItem(original, 1, 1), original);
});

test('drag reordering uses stable project IDs rather than indexes or titles', () => {
  const original = projects('a', 'b', 'c', 'd');
  assert.deepEqual(ids(helpers.reorderById(original, 'a', 'c', false)), [
    'b',
    'a',
    'c',
    'd',
  ]);
  assert.deepEqual(ids(helpers.reorderById(original, 'a', 'c', true)), [
    'b',
    'c',
    'a',
    'd',
  ]);
  assert.deepEqual(ids(helpers.reorderById(original, 'd', 'b', false)), [
    'a',
    'd',
    'b',
    'c',
  ]);
  assert.deepEqual(ids(helpers.reorderById(original, 'a', 'a', true)), [
    'a',
    'b',
    'c',
    'd',
  ]);
  assert.deepEqual(ids(helpers.reorderById(original, 'missing', 'a', true)), [
    'a',
    'b',
    'c',
    'd',
  ]);
});

test('order comparison detects dirty and restored orders by ID', () => {
  const original = projects('a', 'b', 'c');
  const reordered = helpers.reorderById(original, 'a', 'c', true);
  assert.equal(helpers.sameOrder(original, projects('a', 'b', 'c')), true);
  assert.equal(helpers.sameOrder(original, reordered), false);
  assert.equal(helpers.sameOrder(original, projects('a', 'b')), false);
  assert.equal(helpers.sameOrder(original, []), false);
});

test('cloneList copies projects and tag arrays without sharing mutation', () => {
  const original = projects('a');
  const copy = helpers.cloneList(original);
  copy[0].title = 'Changed';
  copy[0].tags.push('new');
  assert.equal(original[0].title, 'Project a');
  assert.deepEqual(original[0].tags, ['tag-a']);
});

test('order helpers are pure and never mutate their input', () => {
  const original = projects('a', 'b', 'c');
  const snapshot = JSON.stringify(original);
  helpers.moveItem(original, 0, 2);
  helpers.reorderById(original, 'a', 'c', true);
  helpers.sameOrder(original, projects('c', 'b', 'a'));
  assert.equal(JSON.stringify(original), snapshot);
});

test('admin rendering uses safe DOM APIs for project data', () => {
  assert.match(adminSource, /textContent/);
  assert.doesNotMatch(adminSource, /innerHTML/);
  assert.doesNotMatch(adminSource, /insertAdjacentHTML/);
  assert.doesNotMatch(adminSource, /outerHTML/);
  assert.doesNotMatch(adminSource, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(adminSource, /<[a-z][^>]*>/i);
});

test('dashboard exposes drag, keyboard, dirty, and save-order controls', () => {
  for (const id of ['projectList', 'saveOrder', 'orderStatus']) {
    assert.match(developerHtml, new RegExp(`id="${id}"`));
  }
  assert.match(developerHtml, /id="message"[^>]*role="status"/);
  assert.match(adminSource, /function moveItem\(/);
  assert.match(adminSource, /function reorderById\(/);
  assert.match(adminSource, /function syncOrderDirty\(/);
  assert.match(adminSource, /orderDirty/);
  assert.match(adminSource, /dragstart/);
  assert.match(adminSource, /dragover/);
  assert.match(adminSource, /drop/);
  assert.match(adminSource, /dragStartItems/);
  assert.match(adminSource, /endDrag\(!dropHandled\)/);
  assert.match(
    adminSource,
    /if \(restore && snapshot\) \{\s*items = snapshot;/,
  );
  assert.match(adminSource, /Reorder canceled\. The previous order/);
  assert.match(adminSource, /orderDirty = !sameOrder\(items, committedItems\)/);
  assert.match(adminSource, /orderDirty = false/);
  assert.match(adminSource, /Move up/);
  assert.match(adminSource, /Move down/);
  assert.match(adminSource, /Save order/);
  assert.match(adminSource, /status === 409/);
  assert.match(adminSource, /latest order has been loaded/i);
});

test('first and last move controls are disabled at the boundaries', () => {
  assert.match(adminSource, /up\.disabled = saving \|\| i === 0/);
  assert.match(
    adminSource,
    /down\.disabled = saving \|\| i === rows\.length - 1/,
  );
});
