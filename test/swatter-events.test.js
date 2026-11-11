const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { readFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, unlinkSync } = require('node:fs');
const path = require('node:path');
const { createInterface } = require('node:readline');
const test = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const origin = 'https://cover.fixture.test';

async function start(t, env) {
  const child = spawn(process.execPath, ['-e', `
    const server = require('./server.js').createServer();
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));
  `], { cwd: root, env: { ...process.env, XHTTP_PATH: '', REMOVI_SWATTER_WEB_AUDIT: '0', REMOVI_TRUST_PROXY: '0', REMOVI_TRUSTED_PROXY_IPS: undefined, REMOVI_PUBLIC_ORIGINS: undefined, REMOVI_SWATTER_LOG_DIR: '', REMOVI_INSTANCE_ID: 'fixture', REMOVI_PUBLIC_ORIGIN: origin, ...env },
    stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const events = [];
  let ready;
  const address = new Promise(resolve => { ready = resolve; });
  lines.on('line', line => {
    if (/^\d+$/.test(line)) ready(`http://127.0.0.1:${line}`);
    if (line.startsWith('{')) events.push(JSON.parse(line));
  });
  const base = await Promise.race([address, closed.then(() => { throw new Error('fixture stopped before ready'); })]);
  return { base, events, stderr: () => stderr, async closeOutput() {
    const disconnected = once(child.stdout, 'close');
    child.stdout.destroy();
    await disconnected;
  } };
}

function submit(base, body, from = origin, { headers, ...options } = {}) {
  return fetch(base + '/api/_events', { ...options, method: 'POST', body: JSON.stringify(body),
    headers: { Origin: from, 'Content-Type': 'application/json', 'X-Real-IP': '8.8.8.8', 'X-Forwarded-For': '1.1.1.1', ...headers } });
}

async function waitFor(condition) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) await delay(10);
}

test('web audit records one final response with safe route metadata and preserves methods', async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '0', REMOVI_SWATTER_WEB_AUDIT: '1', XHTTP_PATH: '/private-fixture' });
  const cases = [
    ['/api/catalog?q=QUERY_SECRET', 'GET', 200, '/api/catalog', 'api_known'],
    ['/api/video?id=ID_SECRET', 'GET', 404, '/api/video', 'api_known'],
    ['/api/channel', 'POST', 200, '/api/channel', 'api_known'],
    ['/api/catalog', 'HEAD', 200, '/api/catalog', 'api_known'],
    ['/api/channel', 'PROPFIND', 200, '/api/channel', 'api_known'],
    ['/api/UNKNOWN_SECRET?token=QUERY_SECRET', 'GET', 404, '/api/_unknown', 'api_unknown'],
    ['/scripts/client-api.js', 'GET', 200, '/scripts/client-api.js', 'asset'],
    ['/assets/previews/audio-000.svg', 'GET', 200, '/assets/previews/_asset', 'asset'],
    ['/assets/previews/MISSING_SECRET.svg', 'GET', 404, '/assets/previews/_asset', 'asset'],
    ['/video/ID_SECRET', 'GET', 200, '/video/_id', 'page'],
    ['/channel/AUTHOR_SECRET', 'GET', 200, '/channel/_author', 'page'],
    ['/index.html', 'GET', 302, '/index.html', 'page'],
    ['/UNKNOWN_SECRET', 'GET', 404, '/_unknown', 'other'],
    ['/private-fixture', 'GET', 403, '/_private', 'other']
  ];
  for (const [index, [url, method, status, uri, routeClass]] of cases.entries()) {
    const response = await fetch(base + url, { method, body: method === 'POST' ? 'BODY_SECRET' : undefined, redirect: 'manual', headers: { Host: 'HOST_SECRET', Authorization: 'AUTH_SECRET', Cookie: 'COOKIE_SECRET', 'X-Forwarded-For': '8.8.8.8' } });
    await response.arrayBuffer();
    assert.equal(response.status, status);
    await waitFor(() => events.length > index);
    assert.equal(events.length, index + 1);
    const event = events.at(-1);
    assert.equal(event.schema, 'moskit.http.v1');
    assert.equal(event.status, status);
    assert.equal(event.method, method === 'PROPFIND' ? 'OTHER' : method);
    assert.equal(event.uri, uri);
    assert.equal(event.route_class, routeClass);
    assert.match(event.path_hash, /^[a-f0-9]{64}$/);
    assert.equal(event.host, 'cover.fixture.test');
    assert.equal(event.client_ip, null);
    assert.equal(event.gate_denied, false);
  }
  assert.equal(events.length, cases.length);
  assert.doesNotMatch(JSON.stringify(events), /QUERY_SECRET|ID_SECRET|AUTHOR_SECRET|UNKNOWN_SECRET|HOST_SECRET|AUTH_SECRET|COOKIE_SECRET|BODY_SECRET|MISSING_SECRET|private-fixture/);
  // Enabling web audit alone must not inject the form listener or enable its endpoint.
  assert.equal(await (await fetch(base + '/scripts/client-api.js')).text(), readFileSync(path.join(root, 'scripts/client-api.js'), 'utf8'));
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 404);
});

test('web digests preserve unknown-path distinctions while redacting dynamic and private routes before hashing', async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '0', REMOVI_SWATTER_WEB_AUDIT: '1', XHTTP_PATH: '/hidden-fixture' });
  const paths = ['/probe-a?secret=one', '/probe-a?secret=two', '/probe-b', '/video/one', '/video/two', '/hidden-fixture', '/hidden-fixture/SECRET'];
  for (const pathname of paths) await (await fetch(base + pathname)).arrayBuffer();
  await waitFor(() => events.length === paths.length);
  assert.equal(events.length, paths.length);
  assert.equal(events[0].path_hash, events[1].path_hash);
  assert.notEqual(events[0].path_hash, events[2].path_hash);
  assert.equal(events[3].path_hash, events[4].path_hash);
  const { createHash } = require('node:crypto');
  assert.equal(events[5].path_hash, createHash('sha256').update('/_private').digest('hex'));
  assert.equal(events[5].path_hash, events[6].path_hash);
});

test('web audit ignores spoofed attribution from a peer outside the exact allowlist', async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '0', REMOVI_SWATTER_WEB_AUDIT: '1', REMOVI_TRUST_PROXY: '1', REMOVI_TRUSTED_PROXY_IPS: '10.0.0.2' });
  await (await fetch(base + '/', { headers: { 'X-Forwarded-For': '8.8.8.8', 'X-Real-IP': '1.1.1.1' } })).arrayBuffer();
  await waitFor(() => events.length === 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].client_ip, null);
  assert.equal(events[0].ip_source, 'unattributed');
});

test('web audit writer failure does not change HTTP responses or expose request data', async t => {
  const scratch = path.join(root, '.tmp');
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(path.join(scratch, 'swatter-web-fault-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = await start(t, { REMOVI_SWATTER_EVENTS: '0', REMOVI_SWATTER_WEB_AUDIT: '1', REMOVI_SWATTER_LOG_DIR: directory });
  const log = path.join(directory, 'events.jsonl');
  unlinkSync(log);
  mkdirSync(log);
  for (let i = 0; i < 2; i++) {
    assert.equal((await fetch(fixture.base + '/api/catalog?secret=NEVER_LOG')).status, 200);
  }
  await waitFor(() => fixture.stderr().includes('Swatter event write failed'));
  assert.equal(fixture.stderr().match(/Swatter event write failed/g)?.length, 1);
  assert.doesNotMatch(fixture.stderr(), /NEVER_LOG/);
  assert.deepEqual(fixture.events, []);
});

test('web audit keeps form actions separate and shares exact-peer attribution without changing origin checks', async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_SWATTER_WEB_AUDIT: '1', REMOVI_TRUST_PROXY: '1', REMOVI_TRUSTED_PROXY_IPS: '127.0.0.1' });
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 204);
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' }, origin + ':8443')).status, 403);
  await waitFor(() => events.length === 3);
  assert.equal(events.length, 3);
  assert.equal(events.filter(event => event.schema === 'moskit.security.v1').length, 1);
  const web = events.filter(event => event.schema === 'moskit.http.v1');
  assert.deepEqual(web.map(event => event.status), [204, 403]);
  for (const event of events) {
    assert.equal(event.client_ip, '1.1.1.1');
    assert.equal(event.peer_ip, '127.0.0.1');
    assert.equal(event.ip_source, 'trusted_proxy');
  }
});

test('web audit budget bounds visits without spending the form quota', { timeout: 20_000 }, async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_SWATTER_WEB_AUDIT: '1' });
  for (let i = 0; i < 3001; i++) {
    const response = await fetch(base + '/api/missing');
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  }
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 204);
  await waitFor(() => events.some(event => event.schema === 'moskit.security.v1'));
  assert.equal(events.filter(event => event.schema === 'moskit.http.v1').length, 3000);
  assert.equal(events.filter(event => event.schema === 'moskit.security.v1').length, 1);
});

test('web audit records the final 500 when URL parsing fails', async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '0', REMOVI_SWATTER_WEB_AUDIT: '1' });
  const status = await new Promise((resolve, reject) => {
    const request = require('node:http').request(base, { path: 'http://[', method: 'GET' }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(status, 500);
  await waitFor(() => events.length === 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 500);
  assert.equal(events[0].uri, '/_unknown');
});

test('Swatter keeps the original script and endpoint behavior when disabled, invalid, or on an XHTTP collision', { timeout: 10_000 }, async t => {
  const untouched = readFileSync(path.join(root, 'scripts/client-api.js'), 'utf8');
  const scenarios = [
    [{ REMOVI_SWATTER_EVENTS: '0' }, 404, null],
    [{ REMOVI_SWATTER_EVENTS: '1', REMOVI_PUBLIC_ORIGIN: 'https://cover.fixture.test/path' }, 404, /REMOVI_PUBLIC_ORIGIN/],
    [{ REMOVI_SWATTER_EVENTS: '0', REMOVI_SWATTER_WEB_AUDIT: '1', REMOVI_PUBLIC_ORIGIN: 'https://cover.fixture.test/path' }, 404, /REMOVI_PUBLIC_ORIGIN/],
    [{ REMOVI_SWATTER_EVENTS: '1', XHTTP_PATH: '/api/_events' }, 403, /XHTTP_PATH collides/]
  ];
  for (const [env, status, warning] of scenarios) {
    await t.test(`status ${status}, configured origin ${env.REMOVI_PUBLIC_ORIGIN ?? 'default'}`, async childTest => {
      const fixture = await start(childTest, env);
      assert.equal(await (await fetch(fixture.base + '/scripts/client-api.js')).text(), untouched);
      assert.equal((await submit(fixture.base, { event: 'login_submit', page: 'catalog' })).status, status);
      assert.equal((await fetch(fixture.base + '/api/catalog')).status, 200);
      assert.deepEqual(fixture.events, []);
      if (warning) {
        await waitFor(() => warning.test(fixture.stderr()));
        assert.match(fixture.stderr(), warning);
      }
      else assert.doesNotMatch(fixture.stderr(), /Swatter/);
    });
  }
});

test('Swatter accepts only explicitly configured public origins', async t => {
  const second = origin + ':7443';
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_PUBLIC_ORIGINS: `${origin},${second}` });
  for (const from of [origin, second]) assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' }, from)).status, 204);
  for (const from of [origin + ':8443', 'https://wrong.fixture.test', origin + '/']) {
    assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' }, from)).status, 403);
  }
  await waitFor(() => events.length === 2);
  assert.equal(events.length, 2);
});

test('Swatter restricts forwarded attribution to configured immediate peers', async t => {
  for (const [peers, expected] of [['127.0.0.1', '1.1.1.1'], ['::ffff:127.0.0.1', '1.1.1.1'], ['10.0.0.2', null]]) {
    await t.test(peers, async child => {
      const { base, events } = await start(child, { REMOVI_SWATTER_EVENTS: '1', REMOVI_TRUST_PROXY: '1', REMOVI_TRUSTED_PROXY_IPS: peers });
      assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 204);
      await waitFor(() => events.length === 1);
      assert.equal(events[0].client_ip, expected);
      assert.equal(events[0].ip_source, expected ? 'trusted_proxy' : 'unattributed');
    });
  }
});

test('Swatter disables events for malformed origin or exact-peer allowlists', async t => {
  for (const env of [
    { REMOVI_PUBLIC_ORIGINS: origin + ',https://wrong.fixture.test/path' },
    { REMOVI_PUBLIC_ORIGINS: origin + ',' },
    { REMOVI_PUBLIC_ORIGINS: '' },
    { REMOVI_TRUSTED_PROXY_IPS: '127.0.0.1/8' },
    { REMOVI_TRUSTED_PROXY_IPS: 'localhost' },
    { REMOVI_TRUSTED_PROXY_IPS: '', REMOVI_TRUST_PROXY: '1' }
  ]) {
    const { base } = await start(t, { REMOVI_SWATTER_EVENTS: '1', ...env });
    assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 404);
  }
});

test('Swatter file output contains only validated event fields', async t => {
  const scratch = path.join(root, '.tmp');
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(path.join(scratch, 'swatter-log-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_SWATTER_LOG_DIR: directory });
  const log = path.join(directory, 'events.jsonl');
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog', password: 'never-log-this' })).status, 400);
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 204);
  await waitFor(() => existsSync(log) && readFileSync(log, 'utf8').includes('decoy_login_attempt'));
  const content = readFileSync(log, 'utf8');
  assert.doesNotMatch(content, /never-log-this|password/);
  const lines = content.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event, 'decoy_login_attempt');
  assert.deepEqual(events, []);
});

test('Swatter uses the served browser listener and real endpoint for the four demo forms', { timeout: 10_000 }, async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1' });
  const script = await fetch(base + '/scripts/client-api.js');
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('cache-control'), 'no-store');
  let listener;
  let pending;
  vm.runInNewContext(await script.text(), {
    window: {}, document: { addEventListener(type, callback, capture) {
      assert.equal(type, 'submit'); assert.equal(capture, true); listener = callback;
    } },
    fetch(url, options) {
      assert.equal(url, '/api/_events');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrer, '');
      pending = submit(base, JSON.parse(options.body), origin, { keepalive: options.keepalive });
      return pending;
    }
  });
  assert.equal(typeof listener, 'function');
  const cases = [
    ['formLogin', 'decoy_login_attempt', 'catalog'], ['formRegister', 'decoy_register_attempt', 'catalog'],
    ['playerLoginForm', 'decoy_login_attempt', 'video'], ['playerRegisterForm', 'decoy_register_attempt', 'video']
  ];
  for (const [i, [id, event, page]] of cases.entries()) {
    listener({ target: { id, tagName: 'FORM', get elements() { throw Error('must not read form values'); } },
      preventDefault() { throw Error('must not alter existing form behavior'); } });
    assert.equal((await pending).status, 204);
    for (let attempt = 0; attempt < 100 && events.length <= i; attempt++) await delay(10);
    const { ts, ...record } = events[i];
    assert(Number.isFinite(ts) && Math.abs(ts - Date.now() / 1000) < 10);
    assert.deepEqual(record, { schema: 'moskit.security.v1', event, page, service: 'videohub', instance: 'fixture',
      peer_ip: '127.0.0.1', client_ip: null, ip_source: 'unattributed', signal: 'client_reported' });
  }
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog', secret: 'synthetic-value' })).status, 400);
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' }, 'https://wrong.fixture.test')).status, 403);
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog', extra: 'x'.repeat(256) })).status, 413);
  assert.equal((await fetch(base + '/api/catalog')).status, 200);
  assert.equal(events.length, 4);
});

test('Swatter trusts the proxy-written X-Forwarded-For entry only from a private proxy and limits each client separately', { timeout: 10_000 }, async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_TRUST_PROXY: '1' });
  const body = { event: 'login_submit', page: 'catalog' };
  // The client-supplied left entry and X-Real-IP (8.8.8.8 from submit) must be ignored.
  const via = ip => ({ headers: { 'X-Forwarded-For': `6.6.6.6, ${ip}` } });
  assert.equal((await submit(base, body, origin, via('1.1.1.1'))).status, 204);
  await waitFor(() => events.length === 1);
  assert.equal(events[0].peer_ip, '127.0.0.1');
  assert.equal(events[0].client_ip, '1.1.1.1');
  assert.equal(events[0].ip_source, 'trusted_proxy');

  // A burst arrives while earlier lines are still being written; none may be lost.
  const burst = await Promise.all(Array.from({ length: 29 }, () => submit(base, body, origin, via('1.1.1.1'))));
  assert(burst.every(response => response.status === 204));
  assert.equal((await submit(base, body, origin, via('1.1.1.1'))).status, 429);
  assert.equal((await submit(base, body, origin, via('9.9.9.9'))).status, 204);
  await waitFor(() => events.length === 31);
  assert.equal(events.length, 31);
  assert.equal(events.at(-1).client_ip, '9.9.9.9');
});

test('Swatter keeps responding after stdout disconnects', { skip: process.platform === 'win32', timeout: 10_000 }, async t => {
  const fixture = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_SWATTER_WEB_AUDIT: '1' });
  await fixture.closeOutput();
  assert.equal((await submit(fixture.base, { event: 'login_submit', page: 'catalog' })).status, 204);
  assert.equal((await fetch(fixture.base + '/api/catalog')).status, 200);
});

test('Swatter rejects invalid envelopes without spending the shared peer quota', { timeout: 20_000 }, async t => {
  const cases = [
    ['wrong Origin', {}, 'https://wrong.fixture.test', 403],
    ['missing Origin', {}, null, 403],
    ['query', { query: '?x=1' }, origin, 400],
    ['method', { method: 'OPTIONS' }, origin, 405],
    ['content type', { type: 'text/plain' }, origin, 415],
    ['content encoding', { encoding: 'gzip' }, origin, 415],
    ['declared size', { body: 'x'.repeat(257) }, origin, 413]
  ];
  for (const trustProxy of ['0', '1']) {
    for (const [name, options, from, status] of cases) {
      await t.test(`${name}, trustProxy=${trustProxy}`, async childTest => {
        const { base, events } = await start(childTest, { REMOVI_SWATTER_EVENTS: '1', REMOVI_TRUST_PROXY: trustProxy });
        for (let i = 0; i < 31; i++) {
          // Same client key as submit(), so a spent quota would block the final valid event.
          const headers = { 'Content-Type': options.type || 'application/json', 'X-Forwarded-For': '1.1.1.1' };
          if (from !== null) headers.Origin = from;
          if (options.encoding) headers['Content-Encoding'] = options.encoding;
          const response = await fetch(base + '/api/_events' + (options.query || ''), {
            method: options.method || 'POST', headers, body: options.body || '{}'
          });
          assert.equal(response.status, status);
        }
        assert.deepEqual(events, []);
        assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 204);
        for (let i = 0; i < 100 && events.length === 0; i++) await delay(10);
        assert.equal(events.length, 1);
        assert.equal(events[0].event, 'decoy_login_attempt');
        assert.equal(events[0].client_ip, trustProxy === '1' ? '1.1.1.1' : null);
        assert.equal(events[0].ip_source, trustProxy === '1' ? 'trusted_proxy' : 'unattributed');
      });
    }
  }
});

test('Swatter still bounds admitted body attempts per shared peer', { timeout: 10_000 }, async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1' });
  // Invalid bodies consume the same bounded parsing budget as valid events.
  for (let i = 0; i < 29; i++) {
    const response = await fetch(base + '/api/_events', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{'
    });
    assert.equal(response.status, 400);
  }
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 204);
  assert.equal((await submit(base, { event: 'login_submit', page: 'catalog' })).status, 429);
  for (let i = 0; i < 100 && events.length === 0; i++) await delay(10);
  assert.equal(events.length, 1);
  assert.equal((await fetch(base + '/api/catalog')).status, 200);
});
