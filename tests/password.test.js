import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';

test('Argon2id password hashes verify only the matching password', async () => {
  const hash = await argon2.hash('test-only password fixture', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(hash, 'test-only password fixture'), true);
  assert.equal(await argon2.verify(hash, 'different test password'), false);
});
