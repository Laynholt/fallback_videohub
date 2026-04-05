# fallback_videohub

Репозиторий: `https://github.com/Laynholt/fallback_videohub.git`

Проект поднимает видеохаб REMOVI через `Node.js + nginx + Docker Compose`.

## Что требуется

- сервер с Docker и Docker Compose
- доступ к репозиторию по `git`

## Первый запуск

```bash
git clone https://github.com/Laynholt/fallback_videohub.git
cd fallback_videohub
cp .env.example .env
docker compose up -d --build
```

После запуска сайт будет доступен на:

```text
http://127.0.0.1:8085
```

Если `127.0.0.1:8085` проброшен через внешний reverse proxy или туннель, используй уже внешний домен.

## Переменные окружения

Файл `.env` управляет основными портами:

```env
PORT=3000
NGINX_PORT=8085
NGINX_BIND_IP=127.0.0.1
```

- `PORT` — внутренний порт Node-приложения
- `NGINX_PORT` — порт, который слушает nginx внутри контейнера и публикует наружу
- `NGINX_BIND_IP` — адрес привязки на хосте

После изменения `.env` перезапусти контейнеры:

```bash
docker compose up -d --build
```

## Обновление проекта

```bash
cd fallback_videohub
git pull
docker compose up -d --build
```

## Остановка

```bash
docker compose down
```

## Перезапуск

```bash
docker compose restart
```

## Просмотр логов

Логи всех сервисов:

```bash
docker compose logs -f
```

Только Node-приложение:

```bash
docker compose logs -f app
```

Только nginx:

```bash
docker compose logs -f nginx
```

## Проверка статуса

```bash
docker compose ps
```

## Если обновился только код

Обычно достаточно этой команды:

```bash
docker compose up -d --build
```

## Если нужно полностью пересобрать контейнеры

```bash
docker compose down
docker compose up -d --build
```

## Где что находится

- [docker-compose.yml](/f:/Data/Code/JavaScript/Fallback/docker-compose.yml) — поднимает `app` и `nginx`
- [Dockerfile](/f:/Data/Code/JavaScript/Fallback/Dockerfile) — собирает контейнер приложения
- [nginx.conf](/f:/Data/Code/JavaScript/Fallback/nginx.conf) — проксирует запросы в Node
- [server.js](/f:/Data/Code/JavaScript/Fallback/server.js) — отдает HTML, статику и API

## Маршруты

Пользовательские URL работают без `.html`:

- `/`
- `/video/:id`
- `/channel/:author`

Старые ссылки вида `player.html?id=...` и `channel.html?author=...` автоматически редиректятся на новые адреса.

## Базовая диагностика

Если сайт не открывается:

1. Проверь, что контейнеры запущены:
```bash
docker compose ps
```

2. Проверь логи:
```bash
docker compose logs -f
```

3. Проверь, что порт слушается:
```bash
curl http://127.0.0.1:8085
```

4. Если порт занят, поменяй `NGINX_PORT` или `NGINX_BIND_IP` в [.env.example](/f:/Data/Code/JavaScript/Fallback/.env.example), затем обнови свой `.env` и перезапусти контейнеры.
