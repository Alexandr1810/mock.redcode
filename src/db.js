// Подключение к SQLite. Соединение можно закрыть и открыть заново (загрузка бэкапа).

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resources (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    next_record_id  INTEGER NOT NULL DEFAULT 1,
    UNIQUE(project_id, name)
  );

  CREATE TABLE IF NOT EXISTS records (
    resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    id           INTEGER NOT NULL,
    data         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (resource_id, id)
  );
`;

// Открывает файл и включает WAL.
function open() {
  const conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  return conn;
}

let conn = open();

// Прокси: все require('../db') видят актуальное соединение после restore.
const db = {
  get path() {
    return DB_PATH;
  },
  prepare(...args) {
    return conn.prepare(...args);
  },
  exec(...args) {
    return conn.exec(...args);
  },
  pragma(...args) {
    return conn.pragma(...args);
  },
  backup(...args) {
    return conn.backup(...args);
  },
  transaction(fn) {
    return conn.transaction(fn);
  },
  close() {
    conn.close();
  },
  reopen() {
    conn = open();
  },
};

module.exports = db;
