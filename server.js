const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const {
  getCatalogPage,
  getChannelPayload,
  getVideoPayload
} = require('./server/catalog-service');

const ROOT = __dirname;

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  });
}

loadEnvFile();

const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(message);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function safeJoin(root, targetPath) {
  const resolved = path.resolve(root, `.${targetPath}`);
  return resolved.startsWith(root) ? resolved : null;
}

function resolvePagePath(pathname) {
  if (pathname === '/' || pathname === '/index.html') return '/index.html';
  if (pathname.startsWith('/video/')) return '/player.html';
  if (pathname.startsWith('/channel/')) return '/channel.html';
  return pathname;
}

function serveFile(response, pathname) {
  if (
    pathname === '/scripts/catalog-data.js' ||
    pathname === '/server.js' ||
    pathname === '/package.json' ||
    pathname.startsWith('/server/')
  ) {
    sendText(response, 404, 'Not found');
    return;
  }

  const normalizedPath = resolvePagePath(pathname);
  const filePath = safeJoin(ROOT, normalizedPath);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, 'Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(response);
}

function handleApi(requestUrl, response) {
  const pathname = requestUrl.pathname;

  if (pathname === '/api/catalog') {
    const filter = requestUrl.searchParams.get('filter') || 'all';
    const query = requestUrl.searchParams.get('q') || '';
    const offset = requestUrl.searchParams.get('offset') || '0';
    const limit = requestUrl.searchParams.get('limit') || '30';
    sendJson(response, 200, getCatalogPage({ filter, query, offset, limit }));
    return true;
  }

  if (pathname === '/api/video') {
    const id = requestUrl.searchParams.get('id');
    const payload = getVideoPayload(id);
    if (!payload) {
      sendJson(response, 404, { error: 'Video not found' });
      return true;
    }
    sendJson(response, 200, payload);
    return true;
  }

  if (pathname === '/api/channel') {
    const author = requestUrl.searchParams.get('author') || '';
    sendJson(response, 200, getChannelPayload(author));
    return true;
  }

  return false;
}

function createServer() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const pathname = requestUrl.pathname;

    if (pathname.startsWith('/api/')) {
      if (!handleApi(requestUrl, response)) {
        sendJson(response, 404, { error: 'Not found' });
      }
      return;
    }

    if (pathname === '/index.html') {
      redirect(response, '/');
      return;
    }

    if (pathname === '/player.html') {
      const id = requestUrl.searchParams.get('id');
      if (id) {
        redirect(response, `/video/${encodeURIComponent(id)}`);
        return;
      }
    }

    if (pathname === '/channel.html') {
      const author = requestUrl.searchParams.get('author');
      if (author) {
        redirect(response, `/channel/${encodeURIComponent(author)}`);
        return;
      }
    }

    serveFile(response, pathname);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`REMOVI server running at http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
