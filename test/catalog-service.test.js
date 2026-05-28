const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getCatalogPage,
  getVideoPayload
} = require('../server/catalog-service');

test('catalog exposes 200 generated releases', () => {
  const page = getCatalogPage({ limit: 1 });

  assert.equal(page.total, 200);
});

test('catalog serializes public video ids as short non-numeric slugs', () => {
  const page = getCatalogPage({ limit: 12, seed: 'test-seed' });
  const ids = page.items.map((item) => item.id);

  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => {
    assert.match(id, /^[a-z0-9]{10,12}$/);
    assert.doesNotMatch(id, /^\d+$/);
  });
});

test('video payload resolves by public slug and rejects raw numeric ids', () => {
  const page = getCatalogPage({ limit: 1, seed: 'video-slug-test' });
  const publicId = page.items[0].id;

  assert.ok(getVideoPayload(publicId));
  assert.equal(getVideoPayload('0'), null);
});
