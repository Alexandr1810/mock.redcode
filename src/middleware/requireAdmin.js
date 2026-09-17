// Пароль админки из ADMIN_PASSWORD.
// Пустой пароль: в dev пускаем всех, в production — ошибка 500.

const crypto = require('crypto');

function unauthorized(res) {
  // Без WWW-Authenticate: иначе браузер покажет своё окно с логином и паролем.
  return res.status(401).json({ error: 'Нужна авторизация' });
}

// Сравнивает пароли за постоянное время, чтобы не светить длину через тайминг.
function passwordsMatch(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Пускает в /admin/api: Basic Auth либо открыто, если пароль не задан (dev).
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD || '';

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Задайте ADMIN_PASSWORD' });
    }
    return next();
  }

  const header = req.headers.authorization || '';
  const [type, encoded] = header.split(' ');
  if (type !== 'Basic' || !encoded) return unauthorized(res);

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const password = sep === -1 ? decoded : decoded.slice(sep + 1);

  if (!passwordsMatch(password, expected)) return unauthorized(res);
  next();
}

module.exports = requireAdmin;
