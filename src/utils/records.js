// Общие операции с записями: публичный API и админка.

const db = require('../db');

// Проверяет, что значение — JSON-объект, а не массив и не скаляр.
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Копия объекта без поля id: идентификатор выдаёт только сервер.
function withoutId(body) {
  const payload = { ...body };
  delete payload.id;
  return payload;
}

// Собирает ответ: серверный id всегда строка.
function toRecord(row) {
  return { id: String(row.id), ...JSON.parse(row.data) };
}

// Все записи ресурса по возрастанию id.
function listByResource(resourceId) {
  return db
    .prepare('SELECT id, data FROM records WHERE resource_id = ? ORDER BY id ASC')
    .all(resourceId)
    .map(toRecord);
}

// Одна запись или undefined.
function getById(resourceId, id) {
  const row = db
    .prepare('SELECT id, data FROM records WHERE resource_id = ? AND id = ?')
    .get(resourceId, id);
  return row ? toRecord(row) : undefined;
}

// Вставляет запись, id берёт из счётчика ресурса (в транзакции).
function insertRecord(resourceId, payload) {
  return db.transaction(() => {
    const { next_record_id: nextId } = db
      .prepare('SELECT next_record_id FROM resources WHERE id = ?')
      .get(resourceId);

    db.prepare('INSERT INTO records (resource_id, id, data) VALUES (?, ?, ?)').run(
      resourceId,
      nextId,
      JSON.stringify(payload)
    );
    db.prepare('UPDATE resources SET next_record_id = ? WHERE id = ?').run(
      nextId + 1,
      resourceId
    );
    return { id: String(nextId), ...payload };
  })();
}

// Частичный merge. Возвращает обновлённую запись или undefined, если нет строки.
function mergeRecord(resourceId, id, patch) {
  const row = db
    .prepare('SELECT id, data FROM records WHERE resource_id = ? AND id = ?')
    .get(resourceId, id);
  if (!row) return undefined;

  const merged = { ...JSON.parse(row.data), ...patch };
  db.prepare('UPDATE records SET data = ? WHERE resource_id = ? AND id = ?').run(
    JSON.stringify(merged),
    resourceId,
    id
  );
  return { id: String(id), ...merged };
}

// Полная замена JSON (для редактора админки). id не меняется.
function replaceRecord(resourceId, id, payload) {
  const row = db
    .prepare('SELECT id FROM records WHERE resource_id = ? AND id = ?')
    .get(resourceId, id);
  if (!row) return undefined;

  db.prepare('UPDATE records SET data = ? WHERE resource_id = ? AND id = ?').run(
    JSON.stringify(payload),
    resourceId,
    id
  );
  return { id: String(id), ...payload };
}

// Разбирает id из JSON: целое ≥ 1 или «не задан». Иначе { invalid: true }.
function parseRecordId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1) return { invalid: true };
  return n;
}

// Полная замена коллекции массивом объектов (редактор админки).
// id в элементах необязателен; дубли и нецелые id — ошибка.
function replaceAllRecords(resourceId, items) {
  if (!Array.isArray(items)) return { error: 'Нужен JSON-массив' };

  const rows = [];
  const taken = new Set();

  for (const item of items) {
    if (!isPlainObject(item)) {
      return { error: 'Каждый элемент массива должен быть объектом' };
    }
    const parsed = parseRecordId(item.id);
    if (parsed && typeof parsed === 'object') {
      return { error: 'id должен быть целым числом ≥ 1' };
    }
    if (parsed !== null && taken.has(parsed)) {
      return { error: `Повторяющийся id: ${parsed}` };
    }
    if (parsed !== null) taken.add(parsed);
    rows.push({ id: parsed, payload: withoutId(item) });
  }

  let nextFree = 1;
  for (const row of rows) {
    if (row.id !== null) continue;
    while (taken.has(nextFree)) nextFree += 1;
    row.id = nextFree;
    taken.add(nextFree);
  }

  const nextId = taken.size ? Math.max(...taken) + 1 : 1;

  db.transaction(() => {
    db.prepare('DELETE FROM records WHERE resource_id = ?').run(resourceId);
    const insert = db.prepare(
      'INSERT INTO records (resource_id, id, data) VALUES (?, ?, ?)'
    );
    for (const row of rows) {
      insert.run(resourceId, row.id, JSON.stringify(row.payload));
    }
    db.prepare('UPDATE resources SET next_record_id = ? WHERE id = ?').run(
      nextId,
      resourceId
    );
  })();

  return listByResource(resourceId);
}

// Удаляет запись и возвращает её, либо undefined.
function deleteRecord(resourceId, id) {
  const row = db
    .prepare('SELECT id, data FROM records WHERE resource_id = ? AND id = ?')
    .get(resourceId, id);
  if (!row) return undefined;

  db.prepare('DELETE FROM records WHERE resource_id = ? AND id = ?').run(resourceId, id);
  return toRecord(row);
}

module.exports = {
  isPlainObject,
  withoutId,
  listByResource,
  getById,
  insertRecord,
  mergeRecord,
  replaceRecord,
  replaceAllRecords,
  deleteRecord,
};
