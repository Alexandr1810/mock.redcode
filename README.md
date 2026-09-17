# mockapi-clone

Self-hosted JSON API: замена публичного контракта [mockapi.io](https://mockapi.io) для наших проектов.

В клиентах меняется origin:

```
https://TOKEN.mockapi.io/tasks
→ https://mock.your.domain/TOKEN/tasks
```

ТЗ: [`TZ_mockapi_clone.md`](./TZ_mockapi_clone.md).

## Что умеет

- Проекты с токеном в пути: `/:token/:resource` и `/:token/:resource/:id`
- CRUD, `id` строкой, PUT/PATCH — частичный merge
- Веб-админка: `/admin/` (проекты, ресурсы, JSON записей и всей коллекции)
- Безлимит проектов и записей (потолок — диск и тело запроса до 2 MB)

Не делаем: фильтры, пагинацию, сортировку, вложенные URL, faker, custom responses, аккаунты и роли.

## Стек

Node.js + Express + SQLite (`better-sqlite3`). Админка — статика с того же процесса.

## Запуск

```bash
npm install
copy .env.example .env
npm start
```

| Скрипт | Что делает |
|---|---|
| `npm start` | обычный запуск |
| `npm run dev` | то же + перезапуск при изменении файлов |

Проверка: `http://localhost:3000/health` → `{"ok":true}`  
Админка: `http://localhost:3000/admin/` — пароль из `ADMIN_PASSWORD`.

Если после смены схемы SQLite ругается на колонки — удалите `data.sqlite` и перезапустите.

## Env

Файл `.env` в корне (не коммитить). Уже заданные в системе переменные файл не перебивает.

| Переменная | Смысл | По умолчанию |
|---|---|---|
| `PORT` | порт | `3000` |
| `DB_PATH` | файл SQLite | `data.sqlite` в корне проекта |
| `ADMIN_PASSWORD` | пароль админки | пусто = без входа (только dev) |
| `BACKUPS_DIR` | папка снимков | `backups/` в корне проекта |
| `NODE_ENV` | `production` без пароля → админка отвечает 500 | не задан |

В проде `ADMIN_PASSWORD` обязателен.

## Публичный API

Без авторизации, CORS открыт.

| Метод | Путь |
|---|---|
| GET, POST | `/:token/:resource` |
| GET, PUT, PATCH, DELETE | `/:token/:resource/:id` |

Query-параметры игнорируются. Пустой список — `[]`. Нет записи — `404`.

## Админка

- UI: `/admin/`
- API: `/admin/api/...` (тот же пароль)
- `GET /admin/api/status` — `{ "passwordRequired": true/false }`, без пароля

После входа в шапке кнопка «Выйти». Если пароль не задан, вход выключен.

## Бэкап

В админке: **Бэкапы** → создать / скачать / удалить / **загрузить**. Загрузка подменяет живой `data.sqlite` (WAL закрывается сам). Перед этим сервер пишет страховочный снимок — его имя покажется после успеха.

Файлы лежат в `backups/` (имя с датой). Папку можно сменить `BACKUPS_DIR`.

## Прод: HTTPS и прокси

Node слушает HTTP. TLS — на nginx или Caddy. Пример домена: `mock.your.domain`.

Клиенты ходят на `https://mock.your.domain/TOKEN/tasks`. Админка: `https://mock.your.domain/admin/`.

### Caddy

```
mock.your.domain {
  reverse_proxy 127.0.0.1:3000
}
```

Сертификат Let's Encrypt Caddy выпускает сам.

### nginx

```
server {
  listen 443 ssl http2;
  server_name mock.your.domain;

  ssl_certificate     /etc/ssl/mock.your.domain/fullchain.pem;
  ssl_certificate_key /etc/ssl/mock.your.domain/privkey.pem;

  client_max_body_size 2m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Рядом HTTP→HTTPS редирект по желанию. Процесс Node лучше держать через systemd / pm2 / nssm, `NODE_ENV=production`.

## Логи

В stdout: `METHOD /path status timeMs`. Тела запросов не пишутся.
