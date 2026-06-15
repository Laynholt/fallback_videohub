const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function copyFileToFixture(fixtureRoot, relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) return;

  const destination = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirToFixture(fixtureRoot, relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return;

  const destination = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function createFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-videohub-'));

  for (const relativePath of [
    'server.js',
    'index.html',
    'player.html',
    'channel.html',
    'package.json',
    'Dockerfile',
    'docker-compose.yml',
    'nginx.conf',
    'README.md',
    '.dockerignore',
    '.env.example',
    '.gitignore',
    'test/catalog-service.test.js',
    'screenshots/example-main.png',
    'assets/previews/audio-000.svg',
    'assets/previews/video-000.svg'
  ]) {
    copyFileToFixture(fixtureRoot, relativePath);
  }

  copyDirToFixture(fixtureRoot, 'server');

  for (const relativePath of [
    'scripts/app.js',
    'scripts/catalog-data.js',
    'scripts/channel.js',
    'scripts/client-api.js',
    'scripts/generate-local-previews.mjs',
    'scripts/player.js'
  ]) {
    copyFileToFixture(fixtureRoot, relativePath);
  }

  fs.writeFileSync(path.join(fixtureRoot, '.git'), 'gitdir: /tmp/not-public\n');

  return fixtureRoot;
}

function loadCreateServer(fixtureRoot) {
  const serverPath = require.resolve(path.join(fixtureRoot, 'server.js'));
  delete require.cache[serverPath];
  return require(serverPath).createServer;
}

function unloadFixtureModules(fixtureRoot) {
  const prefix = `${fixtureRoot}${path.sep}`;
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(prefix)) {
      delete require.cache[modulePath];
    }
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        method: 'GET'
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('does not serve sensitive project, deployment, and server files', async () => {
  const fixtureRoot = createFixture();
  const createServer = loadCreateServer(fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, '.env'), 'SECRET_TOKEN=must-not-leak\n');
  const server = createServer();
  const listener = await listen(server);

  try {
    const sensitivePaths = [
      '/.env',
      '/.env.example',
      '/.dockerignore',
      '/.git',
      '/.gitignore',
      '/Dockerfile',
      '/docker-compose.yml',
      '/nginx.conf',
      '/README.md',
      '/server.js',
      '/package.json',
      '/scripts/catalog-data.js',
      '/scripts/generate-local-previews.mjs',
      '/server/catalog-service.js',
      '/test/catalog-service.test.js',
      '/screenshots/example-main.png'
    ];

    for (const requestPath of sensitivePaths) {
      const res = await request(listener.port, requestPath);
      assert.equal(res.statusCode, 404, `${requestPath} should not be publicly readable`);
      assert.doesNotMatch(res.body, /must-not-leak/, `${requestPath} leaked synthetic secret content`);
    }
  } finally {
    await listener.close();
    unloadFixtureModules(fixtureRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('continues serving the intended public app surface', async () => {
  const fixtureRoot = createFixture();
  const createServer = loadCreateServer(fixtureRoot);
  const server = createServer();
  const listener = await listen(server);

  try {
    const checks = [
      ['/', 200, 'text/html'],
      ['/video/demo-track', 200, 'text/html'],
      ['/channel/demo-author', 200, 'text/html'],
      ['/scripts/client-api.js', 200, 'text/javascript'],
      ['/scripts/app.js', 200, 'text/javascript'],
      ['/scripts/player.js', 200, 'text/javascript'],
      ['/scripts/channel.js', 200, 'text/javascript'],
      ['/assets/previews/audio-000.svg', 200, 'image/svg+xml'],
      ['/assets/previews/video-000.svg', 200, 'image/svg+xml']
    ];

    for (const [requestPath, expectedStatus, expectedType] of checks) {
      const res = await request(listener.port, requestPath);
      assert.equal(res.statusCode, expectedStatus, `${requestPath} should remain public`);
      assert.ok(res.headers['content-type'].includes(expectedType), `${requestPath} content type`);
    }
  } finally {
    await listener.close();
    unloadFixtureModules(fixtureRoot);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
