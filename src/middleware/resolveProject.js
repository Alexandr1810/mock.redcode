// Ищет проект по токену из URL: /:token/...
// Кладёт строку проекта в req.project или отвечает 404.

const db = require('../db');

function resolveProject(req, res, next) {
  const project = db
    .prepare('SELECT * FROM projects WHERE token = ?')
    .get(req.params.token);

  if (!project) {
    return res.status(404).json({ error: `Проект "${req.params.token}" не найден` });
  }

  req.project = project;
  next();
}

module.exports = resolveProject;
