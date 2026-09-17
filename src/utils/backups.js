// Снимки SQLite в папку backups/: создание, список, путь к файлу.
// db.backup учитывает WAL — копия консистентна при работающем сервере.

const fs = require('fs');
const path = require('path');
const db = require('../db');

const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(__dirname, '..', '..', 'backups');
const NAME_RE = /^mockredcode-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}\.sqlite$/;

// Папка для файлов бэкапа (создаётся при первом снимке).
function backupsDir() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  return BACKUPS_DIR;
}

// Локальная метка времени для имени файла: 2026-09-15_18-56-02-123
function timeStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`
  );
}

// Полный путь, если имя из нашего шаблона. Иначе null (защита от ../).
function resolveName(name) {
  if (!NAME_RE.test(name)) return null;
  return path.join(backupsDir(), name);
}

// Список бэкапов, новые сверху.
function listBackups() {
  const dir = backupsDir();
  return fs
    .readdirSync(dir)
    .filter((name) => NAME_RE.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return {
        name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Пишет новый файл mockredcode-ДАТА.sqlite и возвращает карточку.
async function createBackup() {
  const name = `mockredcode-${timeStamp()}.sqlite`;
  const dest = path.join(backupsDir(), name);
  await db.backup(dest);
  const stat = fs.statSync(dest);
  return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
}

// Удаляет файл бэкапа. false — имя плохое или файла нет.
function deleteBackup(name) {
  const file = resolveName(name);
  if (!file || !fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

// Стирает -wal/-shm рядом с основной базой (после подмены файла).
function removeSidecars() {
  for (const extra of ['-wal', '-shm']) {
    const sidecar = db.path + extra;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
}

// Подменяет живую базу выбранным снимком. Сначала сохраняет текущее состояние.
async function restoreBackup(name) {
  const file = resolveName(name);
  if (!file || !fs.existsSync(file)) {
    return { error: 'Бэкап не найден' };
  }

  const safety = await createBackup();

  db.close();
  try {
    fs.copyFileSync(file, db.path);
    removeSidecars();
    db.reopen();
  } catch (err) {
    try {
      db.reopen();
    } catch (_) {
      /* соединение могли уже открыть */
    }
    return { error: err.message || 'Не удалось загрузить бэкап' };
  }

  return { ok: true, restored: name, safetyBackup: safety.name };
}

module.exports = {
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  resolveName,
};
