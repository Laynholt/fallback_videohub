# fallback_videohub

Фронтенд-витрина REMOVI Audio с каталогом релизов, страницами треков и профилями авторов. Проект можно поднимать через `Docker Compose` с `nginx` и TLS или запускать локально напрямую через `node server.js`.

Репозиторий: `https://github.com/Laynholt/fallback_videohub.git`

## Скриншоты

### Каталог

![Каталог релизов](screenshots/example-main.png)

### Страница релиза

![Страница релиза](screenshots/example-video.png)

### Страница автора

![Страница автора](screenshots/example-channel.png)

## Что есть в проекте

- главная страница с каталогом и фильтрами по жанрам;
- поиск по названию трека и имени автора;
- страница релиза с блоком похожих работ;
- страница автора со статистикой и всеми публикациями;
- JSON API для каталога, карточки релиза и страницы автора;


## Быстрый запуск через Docker Compose

Это основной сценарий для запуска с `nginx`, HTTPS и пробросом сертификатов.

```bash
git clone https://github.com/Laynholt/fallback_videohub.git
cd fallback_videohub
cp .env.example .env
docker compose up -d --build
```

После запуска доступны:

- `https://SITE_DOMAIN:NGINX_HTTPS_PORT` для HTTPS;
- `http://SITE_DOMAIN:NGINX_HTTP_PORT` для HTTP с редиректом на HTTPS.

Перед первым запуском нужно заполнить `.env` корректными значениями домена и путей к TLS-сертификатам.

## Переменные окружения

Пример лежит в [.env.example](/f:/Data/Code/JavaScript/Fallback/.env.example).

| Переменная | Что делает |
| --- | --- |
| `APP_PORT` | Внутренний порт Node.js-приложения в контейнере `app`. |
| `NGINX_HTTPS_PORT` | HTTPS-порт `nginx`. По умолчанию используется `9443`. |
| `NGINX_HTTP_PORT` | HTTP-порт для редиректа на HTTPS. |
| `SITE_DOMAIN` | Домен сайта, который подставляется в конфиг `nginx`. |
| `CERT_FULLCHAIN_PATH` | Путь на хосте к `fullchain.pem`. |
| `CERT_PRIVKEY_PATH` | Путь на хосте к приватному ключу TLS. |

`docker-compose.yml` передает `APP_PORT` в контейнер как переменную `PORT`, а `nginx.conf` собирается через `envsubst` во время старта контейнера.

## Локальный запуск без Docker

Если `nginx` и TLS не нужны, приложение можно поднять напрямую:

```bash
# Linux/macOS
PORT=8085 node server.js
```

```powershell
# Windows PowerShell
$env:PORT=8085
node server.js
```

После этого приложение будет доступно на `http://127.0.0.1:8085`.

## Основные маршруты

- `/` — каталог релизов;
- `/video/:id` — страница релиза;
- `/channel/:author` — страница автора.

Старые URL автоматически редиректятся:

- `/player.html?id=...` -> `/video/:id`
- `/channel.html?author=...` -> `/channel/:author`

## API

- `/api/catalog` — каталог с пагинацией, фильтрами и поиском;
- `/api/video?id=...` — данные конкретного релиза;
- `/api/channel?author=...` — данные страницы автора.

Пример запроса каталога:

```text
/api/catalog?filter=ambient&q=driver&offset=0&limit=30&seed=demo
```

## События форм для Mosquito Swatter

Чтобы включить события, добавьте `REMOVI_SWATTER_EVENTS=1` и `REMOVI_PUBLIC_ORIGIN=https://example.com` в файл окружения приложения. Для Mosquito с Compose overlay это файл `REMOVI_ENV_FILE`. Укажите точный адрес из браузера, включая нестандартный внешний порт, без пути и завершающего `/`. Необязательный `REMOVI_INSTANCE_ID` по умолчанию равен `videohub`. При выключенной или неверной настройке, а также при совпадении с `XHTTP_PATH`, сайт продолжит работать без событий, а причина появится в stderr контейнера (`docker logs removi_app`) строкой `Swatter events disabled: ...`.

Четыре демонстрационные формы каталога и страницы релиза дают `decoy_login_attempt` и `decoy_register_attempt` в stdout контейнера `removi_app`. События означают отправку формы. Поля, cookies и `Referer` браузер не отправляет. По умолчанию приложение использует адрес соединения и игнорирует заголовки переадресации, поэтому за частным прокси запись остаётся без атрибуции клиенту, а лимит 30 событий в минуту становится общим для всех посетителей. `REMOVI_TRUST_PROXY=1` разрешает брать IP из последнего адреса `X-Forwarded-For`, но только когда соединение пришло из частной сети. Этот адрес записывает сам прокси: nginx из `docker-compose.yml` дописывает его в конец, Caddy заменяет недоверенный заголовок целиком. `X-Real-IP` не используется, потому что Caddy пропускает его от клиента без изменений. Тогда `client_ip` и лимит считаются по клиенту, `ip_source` равен `trusted_proxy`, а `peer_ip` остаётся адресом прокси. Включайте это, только если порт приложения доступен лишь через такой прокси. Если перед прокси стоит Xray (fallback или Reality `target`), прокси видит адрес Xray, и настоящий IP появится только после настройки PROXY protocol: `xver` в Xray и приём PROXY protocol в прокси (`proxy_protocol` с `real_ip_header proxy_protocol` в nginx или `listener_wrappers { proxy_protocol }` в Caddy).

Строки событий ждут записи в очереди до 256 штук, поэтому всплеск отправок не теряется. Сверх очереди и при недоступном канале записи события отбрасываются, а сайт продолжает работать.

Лимит — 30 запросов в минуту на определённый сервером адрес клиента. Без доверия прокси это адрес соединения, общий для посетителей за одним прокси; при включённом доверии используется определённый прокси адрес клиента. Неверные путь, метод, Origin, тип/кодировка тела и объявленный размер отклоняются до списания квоты. Запросы, допущенные к чтению тела, расходуют её даже при ошибке JSON или содержимого. Ограничения размера тела, времени чтения и числа одновременных запросов сохраняются.

Для разовой проверки вывода под учётной записью с доступом к Docker:

```sh
docker logs removi_app | jq -Rrc 'fromjson? | select(.schema == "moskit.security.v1")'
```

Для постоянного сбора направьте отфильтрованные строки в отдельный ротируемый файл через доверенный сборщик. В конфигурации Swatter добавьте объект в `sources` и подставьте путь к файлу:

```json
{"id":"videohub_forms","type":"file","path":"/var/log/swatter/videohub.jsonl","parser":"security_json","service":"videohub","nft_eligible":false,"trusted_success":false}
```

Передавайте сообщения JSONL после снятия конверта драйвера Docker. Профиль предназначен для наблюдения.

## Необязательный web audit

`REMOVI_SWATTER_WEB_AUDIT=1` включает отдельный `moskit.http.v1` event после завершения
каждого ответа Node. По умолчанию выключен; `REMOVI_SWATTER_EVENTS` независимо управляет
формами и browser listener. Используются те же обязательные точные origins, instance,
доверенные proxy IP и `REMOVI_SWATTER_LOG_DIR`. Неверная общая конфигурация отключает
оба producer. Origin для поля `host` берётся из первого настроенного origin, а не из
пользовательского Host. Web audit не ограничивает методы маршрутов: например, POST к
read-only API сохраняет прежний ответ. Origin-проверка защищает endpoint форм; обычные
посещения сайта не требуют заголовка Origin.

В событии сохраняются итоговый status, безопасный method, peer/client IP, `ip_source`,
фиксированный `uri`, `route_class`, `path_hash` и `gate_denied: false`. Реальные API
`/api/catalog`, `/api/video`, `/api/channel`, `/api/_events` относятся к `api_known`;
404 отсутствующего видео не является неизвестным API. Неизвестные API имеют alias
`/api/_unknown`, другие неизвестные пути — `/_unknown`. SHA-256 исходного пути без query
различает неизвестные пути. Из absolute-form request target сначала удаляется authority,
включая userinfo; query и fragment также исключаются. До URL-нормализации и хеширования
настроенный XHTTP-путь с подпутями заменяется на `/_private`, идентификаторы видео/автора —
на фиксированные aliases. Завершающие `/` у private prefix учитываются. Имена preview
файлов также заменяются. Query, body, cookies, auth headers, Host и поля форм не пишутся.
Отказ XHTTP 403 не является отказом panel gate.

Событие формы остаётся отдельным действием: успешный submit при включённых обоих
producer даёт один `moskit.security.v1` и один `moskit.http.v1` с HTTP 204.
Web audit имеет отдельный общий бюджет 3000 событий в минуту на процесс и использует
существующую очередь 256 событий и ротацию 3 × 10 MiB. При превышении бюджета/очереди,
недоступности sink и незавершённом соединении событие может отсутствовать; HTTP не
блокируется. Квота форм при этом не расходуется web audit.

Для HTTP задайте отдельный source с `parser: nginx_json`, `mode: observe`,
`nft_eligible: false`, `trusted_success: false`, `options.log_visits: true`,
`options.api_prefixes: ["/api"]` и
`options.legitimate_api_prefixes: ["/api/catalog","/api/video","/api/channel","/api/_events"]`.
Настройки доверия `client_ip` должны совпадать с проверенной цепочкой proxy выше.
В общем файле другой source `security_json` читает только события форм.
Базовый parser совместим с фиксированными URI; использование `path_hash` для подсчёта
разных неизвестных путей требует квалифицированного metadata adapter Swatter.

### Приёмка ingress и browser

Source-тесты (`node --test test/swatter-events.test.js test/swatter-log.test.js`)
проверяют Node и served listener, но не заменяют browser/image и production-приёмку.
Перед включением collector проверьте каждый фактический вход:

1. Caddy с `removiCover=true` напрямую в `removi_app:8085`: загрузить каталог и видео,
   отправить все четыре формы в настоящем браузере; сопоставить четыре form events без
   значений полей и по одному web event с итоговым status для каждого запроса Node.
2. Backup nginx → Node: повторить те же действия на его точном HTTPS origin. Проверить
   оба origins и поддельные XFF/X-Real-IP с двух контролируемых публичных адресов.
   Сверить peer/client с реальным packet path; до подтверждения оставить observe.
3. В Mosquito `deploy/removi/nginx.our-vpn.conf` перехватывает `/hosting-test/ping`,
   `/hosting-test/*` и `/api/v1/video/stream` до Node. Их события относятся к фактическому
   ingress/backend source. Отсутствие Node event ожидаемо; Node 404 при прямом обращении
   не доказывает отказ overlay. При классификации ingress stream — известный API.
4. Caddy с `removiCover=false` обслуживает static-only сайт без Node receiver.
   `/api/_events` там недоступен и form/web events этого приложения не возникают.
   Для них требуется явное подключение Node receiver и согласованный routing; эта
   настройка сама по себе его не создаёт. Сохранить static-only поведение при проверке.

Откат web audit: `REMOVI_SWATTER_WEB_AUDIT=0` и пересоздать приложение поддерживаемым
pipeline. Отдельный флаг форм, origins, trusted peers и routing менять не требуется.

## Полезные команды

```bash
docker compose up -d --build
docker compose down
docker compose restart
docker compose ps
docker compose logs -f
docker compose logs -f app
docker compose logs -f nginx
```

Если менялся только код приложения, обычно достаточно:

```bash
docker compose up -d --build
```

## Структура проекта

- [docker-compose.yml](/f:/Data/Code/JavaScript/Fallback/docker-compose.yml) — поднимает контейнеры `app` и `nginx`.
- [Dockerfile](/f:/Data/Code/JavaScript/Fallback/Dockerfile) — образ Node.js-приложения.
- [nginx.conf](/f:/Data/Code/JavaScript/Fallback/nginx.conf) — reverse proxy и TLS-конфиг.
- [server.js](/f:/Data/Code/JavaScript/Fallback/server.js) — HTTP-сервер, маршруты и API.
- [server/catalog-service.js](/f:/Data/Code/JavaScript/Fallback/server/catalog-service.js) — подготовка данных каталога, релизов и авторов.
- [index.html](/f:/Data/Code/JavaScript/Fallback/index.html) — главная страница каталога.
- [player.html](/f:/Data/Code/JavaScript/Fallback/player.html) — страница релиза.
- [channel.html](/f:/Data/Code/JavaScript/Fallback/channel.html) — страница автора.
- [screenshots](/f:/Data/Code/JavaScript/Fallback/screenshots) — изображения для README.

## Диагностика

Если контейнеры поднялись, но сайт не открывается:

1. Проверь статус сервисов:

```bash
docker compose ps
```

2. Посмотри логи:

```bash
docker compose logs -f
```

3. Убедись, что пути к сертификатам в `.env` существуют на хосте и доступны контейнеру.

4. Проверь, что `SITE_DOMAIN`, `NGINX_HTTP_PORT` и `NGINX_HTTPS_PORT` соответствуют твоей схеме доступа.

### Несколько входов и изолированный сбор событий

Для сайта на нескольких HTTPS-портах задайте `REMOVI_PUBLIC_ORIGINS=https://example.com,https://example.com:7443`. Этот явный список заменяет `REMOVI_PUBLIC_ORIGIN`; каждый элемент должен быть точным origin без пути. Другие origins по-прежнему получают 403.

При `REMOVI_TRUST_PROXY=1` задайте также `REMOVI_TRUSTED_PROXY_IPS` со списком точных IP непосредственных прокси, например `172.19.0.2,127.0.0.1`. CIDR и имена хостов не допускаются. Не входящий в список сосед не может задать клиентский IP через заголовки. Если список не задан, сохраняется прежнее поведение доверия частному соединению. Закрепите адреса контейнеров и проверьте отсутствие общей NAT-границы с недоверенными отправителями: IP определяет сетевого соседа, а не отдельный процесс.

Чтобы сборщику не требовался Docker socket, создайте закрытый каталог и задайте приложению `REMOVI_SWATTER_LOG_DIR=/events`. В этом режиме JSONL событий пишется в `events.jsonl` вместо stdout. Очередь ограничена 256 событиями, ротация сохраняет текущий файл и два предыдущих, до 10 MiB каждый. Каталог должен принадлежать одному процессу приложения; файлы создаются с правами 0640. Сборщику монтируйте только этот каталог на чтение, а его SQLite-хранилище — отдельно на запись. Ошибка записи выводится в stderr один раз; недоступность диска не останавливает сайт, поэтому отслеживайте состояние журнала.

В Swatter используйте источник `type: file`, `parser: security_json`, точный путь к `events.jsonl` и `options: {"ip_source":"client_ip","trust_client_ip":true,"trusted_proxy_cidrs":["172.19.0.2/32"]}` с фактическими адресами прокси. Для наблюдения оставьте `mode: observe`, `firewall.enabled: false`, `nft_eligible: false`, `trusted_success: false`; для проверенной цепочки задайте `attribution: direct`. На каждом входе сопоставьте собственный внешний адрес с событием и БД, повторив запрос с поддельными `X-Forwarded-For` и `X-Real-IP`. Одного включения переменных недостаточно: PROXY protocol и перезапись заголовка последним прокси должны быть настроены до приложения.

## Dependency maintenance

The app uses Node.js 24.22.1 LTS and the proxy uses nginx 1.30.6 on Alpine 3.24, pinned by digest. There are no npm dependencies. Review Node/nginx advisories and run `npm test` before updating the image pins; rebuild the app (`docker compose build --pull`) as well as pulling nginx for a future rollout. Existing containers are unchanged until recreated.

`SITE_DOMAIN` may list several nginx server names separated by spaces; redirects use the first configured name. On Linux with Docker and OpenSSL, run `bash test/nginx-config.sh` to validate both single-name and multi-name TLS configurations.
