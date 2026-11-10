const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
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
  `], { cwd: root, env: { ...process.env, XHTTP_PATH: '', REMOVI_TRUST_PROXY: '0', REMOVI_INSTANCE_ID: 'fixture', REMOVI_PUBLIC_ORIGIN: origin, ...env },
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

test('Swatter keeps the original script and endpoint behavior when disabled, invalid, or on an XHTTP collision', { timeout: 10_000 }, async t => {
  const untouched = readFileSync(path.join(root, 'scripts/client-api.js'), 'utf8');
  const scenarios = [
    [{ REMOVI_SWATTER_EVENTS: '0' }, 404, null],
    [{ REMOVI_SWATTER_EVENTS: '1', REMOVI_PUBLIC_ORIGIN: 'https://cover.fixture.test/path' }, 404, /REMOVI_PUBLIC_ORIGIN/],
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

test('Swatter trusts X-Real-IP only from a private proxy when enabled and limits each client separately', { timeout: 10_000 }, async t => {
  const { base, events } = await start(t, { REMOVI_SWATTER_EVENTS: '1', REMOVI_TRUST_PROXY: '1' });
  const body = { event: 'login_submit', page: 'catalog' };
  assert.equal((await submit(base, body)).status, 204);
  await waitFor(() => events.length === 1);
  assert.equal(events[0].peer_ip, '127.0.0.1');
  assert.equal(events[0].client_ip, '8.8.8.8');
  assert.equal(events[0].ip_source, 'trusted_proxy');

  // A burst arrives while earlier lines are still being written; none may be lost.
  const burst = await Promise.all(Array.from({ length: 29 }, () => submit(base, body)));
  assert(burst.every(response => response.status === 204));
  assert.equal((await submit(base, body)).status, 429);
  assert.equal((await submit(base, body, origin, { headers: { 'X-Real-IP': '9.9.9.9' } })).status, 204);
  await waitFor(() => events.length === 31);
  assert.equal(events.length, 31);
  assert.equal(events.at(-1).client_ip, '9.9.9.9');
});

test('Swatter keeps responding after stdout disconnects', { skip: process.platform === 'win32', timeout: 10_000 }, async t => {
  const fixture = await start(t, { REMOVI_SWATTER_EVENTS: '1' });
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
          const headers = { 'Content-Type': options.type || 'application/json', 'X-Real-IP': '8.8.8.8' };
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
        assert.equal(events[0].client_ip, trustProxy === '1' ? '8.8.8.8' : null);
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
