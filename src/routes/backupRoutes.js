// Бэкапы админки. Префикс тот же /admin/api.

const express = require('express');
const backups = require('../utils/backups');

const router = express.Router();

// GET /backups — список снимков по дате.
function listBackups(req, res) {
  res.json(backups.listBackups());
}

// POST /backups — новый снимок (SQLite backup API, с WAL).
async function createBackup(req, res) {
  try {
    const info = await backups.createBackup();
    res.status(201).json(info);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Не удалось создать бэкап' });
  }
}

// GET /backups/:name — скачать файл.
function downloadBackup(req, res) {
  const file = backups.resolveName(req.params.name);
  if (!file) return res.status(400).json({ error: 'Некорректное имя файла' });
  res.download(file, req.params.name, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Бэкап не найден' });
    }
  });
}

// DELETE /backups/:name — удалить снимок с диска.
function deleteBackup(req, res) {
  if (!backups.deleteBackup(req.params.name)) {
    return res.status(404).json({ error: 'Бэкап не найден' });
  }
  res.json({ ok: true });
}

// POST /backups/:name/restore — подменить живую базу этим снимком.
async function restoreBackup(req, res) {
  try {
    const result = await backups.restoreBackup(req.params.name);
    if (result.error) {
      const code = result.error === 'Бэкап не найден' ? 404 : 500;
      return res.status(code).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить бэкап' });
  }
}

router.get('/backups', listBackups);
router.post('/backups', createBackup);
router.post('/backups/:name/restore', restoreBackup);
router.get('/backups/:name', downloadBackup);
router.delete('/backups/:name', deleteBackup);

module.exports = router;
