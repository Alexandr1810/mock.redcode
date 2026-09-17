// Читает корневой .env в process.env, не перезаписывая уже заданные переменные.
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq === -1) continue;
    const key = text.slice(0, eq).trim();
    const value = text.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = loadEnv;
