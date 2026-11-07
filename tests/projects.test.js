import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProject } from '../lib/projects.js';

const valid = {
  id: 'project-1',
  title: 'Portfolio',
  subtitle: 'Platform',
  categories: 'fullstack',
  tags: ['Node.js'],
  live: 'https://example.com',
  github: '',
  image: 'assets/logos/servico.jpg',
  imageAlt: 'Logo',
  url: 'example.com',
  status: 'Live',
  description: 'A project.',
};

test('accepts valid project records and normalizes web URLs', () => {
  assert.equal(cleanProject(valid).live, 'https://example.com/');
});
test('rejects null, arrays, nested values, unknown fields and oversized strings', () => {
  for (const value of [
    null,
    [],
    { ...valid, title: { value: 'x' } },
    { ...valid, surprise: 'field' },
    { ...valid, description: 'x'.repeat(5001) },
  ])
    assert.throws(() => cleanProject(value));
});
test('rejects dangerous protocols and remote images', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,evil',
    'vbscript:msgbox(1)',
  ])
    assert.throws(() => cleanProject({ ...valid, live: value }));
  assert.throws(() =>
    cleanProject({ ...valid, image: 'https://tracker.example/image.png' }),
  );
});
test('accepts only hashed upload paths alongside repository assets', () => {
  const name = 'a'.repeat(32);
  assert.equal(
    cleanProject({ ...valid, image: `api/uploads/${name}.png` }).image,
    `api/uploads/${name}.png`,
  );
  assert.equal(
    cleanProject({ ...valid, image: `/api/uploads/${name}.webp` }).image,
    `/api/uploads/${name}.webp`,
  );
  for (const image of [
    'api/uploads/short.png',
    `api/uploads/${name}.svg`,
    `api/uploads/${name}.png?download=1`,
    `api/uploads/${name}/extra.png`,
    `api/uploads/../${name}.png`,
  ])
    assert.throws(() => cleanProject({ ...valid, image }), image);
});

test('rejects duplicate unsafe identifier syntax and malformed tags', () => {
  assert.throws(() => cleanProject({ ...valid, id: '../projects' }));
  assert.throws(() => cleanProject({ ...valid, tags: ['x'.repeat(51)] }));
  assert.throws(() => cleanProject({ ...valid, tags: ['   '] }));
  assert.throws(() => cleanProject({ ...valid, tags: ['ok', ''] }));
  assert.throws(() => cleanProject({ ...valid, tags: ['ok\u0000bad'] }));
});

test('rejects control characters while allowing normal line breaks', () => {
  assert.throws(() =>
    cleanProject({ ...valid, description: 'safe\u0000unsafe' }),
  );
  assert.equal(
    cleanProject({ ...valid, description: 'first\n\nsecond\tvalue' })
      .description,
    'first\n\nsecond\tvalue',
  );
});

test('rejects missing required fields and oversized identifiers', () => {
  assert.throws(() => cleanProject({ ...valid, title: '   ' }));
  assert.throws(() => cleanProject({ ...valid, id: 'x'.repeat(81) }));
  assert.throws(() =>
    cleanProject({ ...valid, live: 'https://example.com/' + 'x'.repeat(500) }),
  );
});
