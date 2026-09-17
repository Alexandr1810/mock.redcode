// Публичный REST ресурса (без авторизации):
//   GET/POST    /:token/:resource
//   GET/PUT/PATCH/DELETE  /:token/:resource/:id
// Query-параметры не читаем: всегда полный список по id.

const express = require('express');
const db = require('../db');
const records = require('../utils/records');

const router = express.Router({ mergeParams: true });

// Находит ресурс проекта по имени из URL, кладёт в req.resource.
function resolveResource(req, res, next) {
  const resource = db
    .prepare('SELECT * FROM resources WHERE project_id = ? AND name = ?')
    .get(req.project.id, req.params.resourceName);

  if (!resource) {
    return res.status(404).json({ error: `Ресурс "${req.params.resourceName}" не найден` });
  }

  req.resource = resource;
  next();
}

// GET / — все записи ресурса.
function listRecords(req, res) {
  res.json(records.listByResource(req.resource.id));
}

// GET /:id — одна запись или 404.
function getRecord(req, res) {
  const row = records.getById(req.resource.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

// POST / — создать запись, id выдаёт сервер.
function createRecord(req, res) {
  if (!records.isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Нужен JSON-объект' });
  }
  res.status(201).json(records.insertRecord(req.resource.id, records.withoutId(req.body)));
}

// PUT и PATCH /:id — частичный merge полей.
function updateRecord(req, res) {
  if (!records.isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Нужен JSON-объект' });
  }

  const row = records.mergeRecord(
    req.resource.id,
    req.params.id,
    records.withoutId(req.body)
  );
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

// DELETE /:id — удаляет запись и возвращает её.
function deleteRecord(req, res) {
  const row = records.deleteRecord(req.resource.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

router.get('/', resolveResource, listRecords); // GET /:token/:resource
router.post('/', resolveResource, createRecord); // POST /:token/:resource
router.get('/:id', resolveResource, getRecord); // GET /:token/:resource/:id
router.put('/:id', resolveResource, updateRecord); // PUT /:token/:resource/:id
router.patch('/:id', resolveResource, updateRecord); // PATCH /:token/:resource/:id
router.delete('/:id', resolveResource, deleteRecord); // DELETE /:token/:resource/:id

module.exports = router;
