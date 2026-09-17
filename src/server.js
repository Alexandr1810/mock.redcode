// Точка входа: Express, CORS, админский API и публичный REST.

const path = require('path');
const express = require('express');
const cors = require('cors');

require('./loadEnv')();

const resolveProject = require('./middleware/resolveProject');
const requireAdmin = require('./middleware/requireAdmin');
const publicApi = require('./routes/publicApi');
const adminRoutes = require('./routes/adminRoutes');
const backupRoutes = require('./routes/backupRoutes');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(cors());

// Пишет method, path, status и время. Тела запросов не логируем.
function logRequests(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

app.use(logRequests);

// Нужен ли пароль на админке (без секрета в ответе).
function passwordRequired() {
  return Boolean(process.env.ADMIN_PASSWORD) || process.env.NODE_ENV === 'production';
}

// GET /health — жив ли процесс (для прокси и мониторинга).
app.get('/health', (req, res) => res.json({ ok: true }));

// GET /admin/api/status — без пароля: включён ли вход.
app.get('/admin/api/status', (req, res) => {
  res.json({ passwordRequired: passwordRequired() });
});

// /admin/api — управление проектами, ресурсами и записями.
app.use('/admin/api', requireAdmin, adminRoutes);
app.use('/admin/api', requireAdmin, backupRoutes);

// /admin — веб-морда (index.html, стили, скрипт).
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

// /:token/:resource[/:id] — публичный CRUD. Монтируется после /admin и /health.
app.use('/:token/:resourceName', resolveProject, publicApi);

// Любой другой путь — JSON 404, не HTML Express.
app.use((req, res) => {
  res.status(404).json({ error: 'Не найдено' });
});

const PORT = process.env.PORT || 3000;

// npm start и npm dev запускают этот файл.
app.listen(PORT, () => {
  console.log(`mock.redcode24 на http://localhost:${PORT}`);
  if (passwordRequired()) {
    console.log('админка: вход включён (ADMIN_PASSWORD)');
  } else {
    console.log('админка: без пароля (задайте ADMIN_PASSWORD перед продом)');
  }
});
