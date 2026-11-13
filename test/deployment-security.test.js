const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function getComposeServiceBlock(compose, serviceName) {
  const serviceMatch = compose.replace(/\r\n/g, '\n').match(new RegExp(`^  ${serviceName}:\\n((?:    .*\\n?)*)`, 'm'));

  assert.ok(serviceMatch, `docker-compose.yml should include services.${serviceName}`);
  return serviceMatch[1];
}

test('docker build context excludes local secrets and build-only files', () => {
  const dockerignore = fs
    .readFileSync(path.join(root, '.dockerignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const pattern of ['.env*', '.dockerignore', 'Dockerfile']) {
    assert.ok(dockerignore.includes(pattern), `.dockerignore should include ${pattern}`);
  }
});

test('docker image copies only runtime files instead of the whole project context', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

  assert.doesNotMatch(dockerfile, /^\s*COPY\s+\.\s+\.\s*$/m);
  assert.doesNotMatch(dockerfile, /^\s*COPY\s+scripts\s+\.\/scripts\s*$/m);
  assert.doesNotMatch(dockerfile, /generate-local-previews\.mjs/);
  for (const runtimeCopy of [
    'COPY server.js ./',
    'COPY server ./server',
    'COPY scripts/app.js scripts/catalog-data.js scripts/channel.js scripts/client-api.js scripts/player.js ./scripts/',
    'COPY assets ./assets'
  ]) {
    assert.ok(dockerfile.includes(runtimeCopy), `Dockerfile should include ${runtimeCopy}`);
  }
});

test('nginx proxy image is immutable because it receives the TLS private key', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const nginxService = getComposeServiceBlock(compose, 'nginx');
  const imageMatch = nginxService.match(/^    image:\s*(\S+)\s*$/m);

  assert.ok(imageMatch, 'nginx service should declare an image');
  assert.match(nginxService, /\$\{CERT_PRIVKEY_PATH\}:\/etc\/nginx\/certs\/privkey\.pem:ro/);
  assert.doesNotMatch(imageMatch[1], /:latest(?:$|@)/);
  assert.match(imageMatch[1], /@sha256:[a-f0-9]{64}$/);
});

test('nginx adds only HSTS; app owns the other security headers', () => {
  const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');

  assert.match(nginxConfig, /add_header\s+Strict-Transport-Security\s+"max-age=31536000"\s+always;/);
  for (const name of ['Content-Security-Policy', 'Permissions-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
    assert.doesNotMatch(nginxConfig, new RegExp('add_header\\s+' + name + '\\b'), name);
  }
});

test('http redirect keeps the requested host', () => {
  const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');

  assert.match(nginxConfig, /return 301 https:\/\/\$host\$request_uri;/);
});

test('compose rotates container logs', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');

  for (const service of ['app', 'nginx']) {
    const block = getComposeServiceBlock(compose, service);
    assert.match(block, /driver: json-file/, service);
    assert.match(block, /max-size: "10m"/, service);
    assert.match(block, /max-file: "3"/, service);
  }
});

test('nginx HTTPS listen host defaults to 0.0.0.0 and the server hook is wired', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');

  assert.match(getComposeServiceBlock(compose, 'nginx'), /NGINX_LISTEN_HOST: "\$\{NGINX_LISTEN_HOST:-0\.0\.0\.0\}"/);
  assert.match(nginxConfig, /listen \$\{NGINX_LISTEN_HOST\}:\$\{NGINX_HTTPS_PORT\} ssl;/);
  assert.match(nginxConfig, /include \/etc\/nginx\/sites\/server\/\*\.conf;/);
});

test('nginx starts via render.sh, which substitutes every template variable compose passes', () => {
  const nginxService = getComposeServiceBlock(fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8'), 'nginx');
  const render = fs.readFileSync(path.join(root, 'render.sh'), 'utf8');
  const templateVars = new Set(fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8').match(/\$\{[A-Z_][A-Z0-9_]*\}/g));

  assert.match(nginxService, /command: \["\/bin\/sh", "\/etc\/nginx\/render\.sh"\]/);
  assert.match(nginxService, /- \.\/render\.sh:\/etc\/nginx\/render\.sh:ro/);
  // The envsubst list comes from the template itself, not from a hand-written list.
  assert.match(render, /envsubst "\$\(grep -oE .*"\$template"/);
  assert.doesNotMatch(render, /envsubst '/);
  for (const name of [...templateVars].map((v) => v.slice(2, -1))) {
    assert.match(nginxService, new RegExp(`^      ${name}: `, 'm'), `compose should pass ${name} to nginx`);
  }
});

test('NGINX_PROXY_SOCKET is off by default and only adds an optional include', () => {
  const nginxService = getComposeServiceBlock(fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8'), 'nginx');
  const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');

  assert.match(nginxService, /NGINX_PROXY_SOCKET: "\$\{NGINX_PROXY_SOCKET:-\}"/);
  // A glob include: without the file rendered by render.sh nothing is loaded.
  assert.match(nginxConfig, /include \/etc\/nginx\/proxy-socket\*\.conf;/);
  assert.doesNotMatch(nginxConfig, /proxy_protocol|unix:/);
});
