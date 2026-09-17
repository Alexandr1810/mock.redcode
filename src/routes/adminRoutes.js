// Management API админки. Префикс: /admin/api.
// CRUD проектов, ресурсов и записей. Удаление каскадное через FK SQLite.

const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const records = require('../utils/records');

const router = express.Router();
const NAME_RE = /^[a-zA-Z0-9_-]+$/;

// Случайный токен проекта для публичного URL /:token/...
function makeToken() {
  return crypto.randomBytes(6).toString('hex');
}

// Имя или токен: латиница, цифры, _ и -.
function readName(value, field) {
  const name = String(value || '').trim();
  if (!NAME_RE.test(name)) {
    return { error: `${field}: только латиница, цифры, _ и -` };
  }
  return { name };
}

// Проект по id или null.
function findProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

// Ресурс по id или null.
function findResource(id) {
  return db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
}

// SQLITE unique → 400, остальное пробрасываем.
function sendUniqueError(res, err, message) {
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: message });
  }
  throw err;
}

// GET /projects — список проектов.
function listProjects(req, res) {
  res.json(db.prepare('SELECT * FROM projects ORDER BY id DESC').all());
}

// POST /projects — создать проект. Тело: { name, token? }.
function createProject(req, res) {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Нужно поле name' });

  let token = String(req.body?.token || '').trim();
  if (token) {
    const parsed = readName(token, 'token');
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    token = parsed.name;
  } else {
    token = makeToken();
  }

  try {
    const info = db
      .prepare('INSERT INTO projects (token, name) VALUES (?, ?)')
      .run(token, name);
    res.status(201).json({ id: info.lastInsertRowid, token, name });
  } catch (err) {
    sendUniqueError(res, err, `Токен "${token}" уже занят`);
  }
}

// GET /projects/:projectId — один проект.
function getProject(req, res) {
  const project = findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  res.json(project);
}

// PATCH /projects/:projectId — переименовать и/или сменить токен.
function updateProject(req, res) {
  const project = findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });

  let { name, token } = project;
  if (req.body?.name !== undefined) {
    name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'Нужно поле name' });
  }
  if (req.body?.token !== undefined) {
    const parsed = readName(req.body.token, 'token');
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    token = parsed.name;
  }

  try {
    db.prepare('UPDATE projects SET name = ?, token = ? WHERE id = ?').run(
      name,
      token,
      project.id
    );
    res.json({ ...project, name, token });
  } catch (err) {
    sendUniqueError(res, err, `Токен "${token}" уже занят`);
  }
}

// DELETE /projects/:projectId — проект, ресурсы и записи.
function deleteProject(req, res) {
  const project = findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });

  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  res.json(project);
}

// GET /projects/:projectId/resources — коллекции проекта.
function listResources(req, res) {
  const project = findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });

  res.json(
    db
      .prepare('SELECT id, project_id, name, next_record_id FROM resources WHERE project_id = ?')
      .all(project.id)
  );
}

// POST /projects/:projectId/resources — создать коллекцию. Тело: { name }.
function createResource(req, res) {
  const project = findProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });

  const parsed = readName(req.body?.name, 'name');
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const info = db
      .prepare('INSERT INTO resources (project_id, name) VALUES (?, ?)')
      .run(project.id, parsed.name);
    res.status(201).json({ id: info.lastInsertRowid, project_id: project.id, name: parsed.name });
  } catch (err) {
    sendUniqueError(res, err, `Ресурс "${parsed.name}" уже есть в проекте`);
  }
}

// GET /projects/:projectId/resources/:resourceId — одна коллекция.
function getResource(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource || String(resource.project_id) !== String(req.params.projectId)) {
    return res.status(404).json({ error: 'Ресурс не найден' });
  }
  res.json(resource);
}

// PATCH /projects/:projectId/resources/:resourceId — переименовать коллекцию.
function updateResource(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource || String(resource.project_id) !== String(req.params.projectId)) {
    return res.status(404).json({ error: 'Ресурс не найден' });
  }

  const parsed = readName(req.body?.name, 'name');
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    db.prepare('UPDATE resources SET name = ? WHERE id = ?').run(parsed.name, resource.id);
    res.json({ ...resource, name: parsed.name });
  } catch (err) {
    sendUniqueError(res, err, `Ресурс "${parsed.name}" уже есть в проекте`);
  }
}

// DELETE /projects/:projectId/resources/:resourceId — коллекция и её записи.
function deleteResource(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource || String(resource.project_id) !== String(req.params.projectId)) {
    return res.status(404).json({ error: 'Ресурс не найден' });
  }

  db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
  res.json(resource);
}

// GET /resources/:resourceId/records — все записи коллекции.
function listRecords(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });
  res.json(records.listByResource(resource.id));
}

// GET /resources/:resourceId/records/:id — одна запись.
function getRecord(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });

  const row = records.getById(resource.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

// POST /resources/:resourceId/records — создать запись. Тело: произвольный JSON.
function createRecord(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });

  if (!records.isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Нужен JSON-объект' });
  }
  res.status(201).json(records.insertRecord(resource.id, records.withoutId(req.body)));
}

// PUT /resources/:resourceId/records — заменить всю коллекцию массивом.
function replaceAllRecords(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });

  const result = records.replaceAllRecords(resource.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
}

// PUT /resources/:resourceId/records/:id — полная замена JSON (редактор админки).
function replaceRecord(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });

  if (!records.isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Нужен JSON-объект' });
  }

  const row = records.replaceRecord(resource.id, req.params.id, records.withoutId(req.body));
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

// PATCH /resources/:resourceId/records/:id — merge полей.
function updateRecord(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });

  if (!records.isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Нужен JSON-объект' });
  }

  const row = records.mergeRecord(resource.id, req.params.id, records.withoutId(req.body));
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

// DELETE /resources/:resourceId/records/:id — удалить запись.
function deleteRecord(req, res) {
  const resource = findResource(req.params.resourceId);
  if (!resource) return res.status(404).json({ error: 'Ресурс не найден' });

  const row = records.deleteRecord(resource.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Запись не найдена' });
  res.json(row);
}

router.get('/projects', listProjects); // GET /admin/api/projects
router.post('/projects', createProject); // POST /admin/api/projects
router.get('/projects/:projectId', getProject); // GET /admin/api/projects/:id
router.patch('/projects/:projectId', updateProject); // PATCH /admin/api/projects/:id
router.delete('/projects/:projectId', deleteProject); // DELETE /admin/api/projects/:id

router.get('/projects/:projectId/resources', listResources); // GET .../resources
router.post('/projects/:projectId/resources', createResource); // POST .../resources
router.get('/projects/:projectId/resources/:resourceId', getResource); // GET .../resources/:id
router.patch('/projects/:projectId/resources/:resourceId', updateResource); // PATCH .../resources/:id
router.delete('/projects/:projectId/resources/:resourceId', deleteResource); // DELETE .../resources/:id

router.get('/resources/:resourceId/records', listRecords); // GET /admin/api/resources/:id/records
router.put('/resources/:resourceId/records', replaceAllRecords); // PUT .../records (весь массив)
router.post('/resources/:resourceId/records', createRecord); // POST .../records
router.get('/resources/:resourceId/records/:id', getRecord); // GET .../records/:id
router.put('/resources/:resourceId/records/:id', replaceRecord); // PUT .../records/:id (замена)
router.patch('/resources/:resourceId/records/:id', updateRecord); // PATCH .../records/:id
router.delete('/resources/:resourceId/records/:id', deleteRecord); // DELETE .../records/:id

module.exports = router;
