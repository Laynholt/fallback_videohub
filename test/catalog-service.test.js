const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('catalog serializes preview paths as local allowlisted SVG assets', () => {
  const page = getCatalogPage({ limit: 60, seed: 'preview-path-test' });

  for (const card of page.items) {
    assert.match(card.previewStatic, /^\/assets\/previews\/(?:audio|video)-\d{3}\.svg$/);
    assert.match(card.previewFallbackStatic, /^\/assets\/previews\/(?:audio|video)-\d{3}\.svg$/);
  }
});

test('catalog service enforces the preview path allowlist before serialization', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'catalog-service.js'), 'utf8');

  assert.match(source, /function normalizePreviewPath/);
  assert.match(source, /\/assets\\\/previews\\\/\(\?:audio\|video\)-\\d\{3\}\\\.svg/);
  assert.doesNotMatch(source, /String\(card\.previewStatic\)\.startsWith\('\/'\)/);
});

test('catalog service replaces hostile preview paths before API serialization', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-videohub-catalog-'));
  const serviceDir = path.join(fixtureRoot, 'server');
  const scriptsDir = path.join(fixtureRoot, 'scripts');
  fs.mkdirSync(serviceDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, '..', 'server', 'catalog-service.js'),
    path.join(serviceDir, 'catalog-service.js')
  );
  fs.writeFileSync(path.join(scriptsDir, 'catalog-data.js'), `
    window.REMOVI_DATA = {
      ALL_CARDS: [{
        id: 1,
        publicId: 'publicsafe1',
        title: 'Hostile Preview',
        author: 'Canary',
        avatar: 'C',
        duration: '1:00',
        views: '1',
        date: 'вчера',
        quality: 'HD',
        category: 'ambient',
        categoryLabel: 'Ambient',
        previewStatic: '//evil.test/asset.svg',
        previewFallbackStatic: 'assets/previews/video-001.svg" onerror="alert(1)',
        playerExcerpt: 'test'
      }],
      CATEGORY_THEMES: {},
      DEFAULT_MESSAGES: {},
      FILTERS: [],
      SETTINGS: { initial: 30, batch: 30, max: 60 },
      normalizeText(value) { return String(value).toLowerCase(); }
    };
  `);

  try {
    const service = require(path.join(serviceDir, 'catalog-service.js'));
    const video = service.getVideoPayload('publicsafe1').video;

    assert.equal(video.previewStatic, '/assets/previews/audio-000.svg');
    assert.equal(video.previewFallbackStatic, '/assets/previews/audio-000.svg');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
