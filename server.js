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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(html);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function buildErrorPage({ statusCode, title, description, actionLabel = 'На главную', actionHref = '/' }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${statusCode} — ${escapeHtml(title)}</title>
<style>
  :root{
    --bg:#0a0a0c;--surface:#17171f;--border:#2a2a38;--accent:#e8610a;--accent2:#ff8c42;
    --text:#f0eee8;--text2:#9b98a5;
  }
  *{box-sizing:border-box}
  body{
    margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
    background:
      radial-gradient(circle at top right, rgba(232,97,10,.16), transparent 28%),
      radial-gradient(circle at bottom left, rgba(92,105,255,.1), transparent 22%),
      var(--bg);
    color:var(--text);
    font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  }
  .card{
    width:min(100%,640px);padding:32px 28px;border-radius:24px;
    background:linear-gradient(160deg, rgba(17,17,21,.96), rgba(24,24,31,.98));
    border:1px solid rgba(255,255,255,.08);
    box-shadow:0 24px 72px rgba(0,0,0,.45);
  }
  .brand{display:inline-flex;align-items:center;gap:10px;margin-bottom:18px;color:var(--accent2);font-weight:800;letter-spacing:.08em;text-transform:uppercase}
  .brand-mark{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-size:14px}
  .status{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--text2);margin-bottom:12px}
  h1{margin:0 0 12px;font-size:clamp(34px,5vw,58px);line-height:.96;letter-spacing:-.04em}
  p{margin:0 0 24px;color:var(--text2);font-size:16px;line-height:1.65;max-width:52ch}
  .actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .button{display:inline-flex;align-items:center;justify-content:center;min-width:180px;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700;transition:transform .18s ease,background .18s ease,border-color .18s ease}
  .button:hover{transform:translateY(-1px)}
  .button.primary{background:var(--accent);color:#fff}
  .button.primary:hover{background:var(--accent2)}
  .button.ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
  .meta{margin-top:24px;font-size:12px;color:#767382}
  @media (max-width:640px){
    .card{padding:24px 18px;border-radius:20px}
    .actions{flex-direction:column;align-items:stretch}
    .button{width:100%}
  }
</style>
</head>
<body>
  <section class="card">
    <div class="brand"><span class="brand-mark">▶</span><span>REMOVI</span></div>
    <div class="status">Ошибка ${statusCode}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <div class="actions">
      <a class="button primary" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>
      <a class="button ghost" href="javascript:history.back()">Назад</a>
    </div>
    <div class="meta">Если проблема повторяется, проверь адрес или обнови страницу позже.</div>
  </section>
</body>
</html>`;
}

function sendPrettyError(response, statusCode, title, description) {
  sendHtml(response, statusCode, buildErrorPage({ statusCode, title, description }));
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
    if (!path.extname(pathname)) {
      redirect(response, '/');
      return;
    }
    if (path.extname(pathname).toLowerCase() === '.html') {
      sendPrettyError(response, 404, 'Страница не найдена', 'Такого экрана больше нет или адрес был введён с ошибкой.');
      return;
    }
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
    try {
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
    } catch (error) {
      sendPrettyError(response, 500, 'Сервер временно недоступен', 'Во время обработки запроса что-то пошло не так. Попробуй обновить страницу через пару секунд.');
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`REMOVI server running at http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
