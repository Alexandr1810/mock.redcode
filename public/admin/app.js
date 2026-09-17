// Веб-морда админки: проекты → ресурсы → JSON-записи.
// Ходит только в /admin/api. Пароль — Basic Auth, лежит в sessionStorage.

const root = document.getElementById('app');
const PASS_KEY = 'adminPassword';

let password = sessionStorage.getItem(PASS_KEY) || '';
let passwordRequired = false;
let flash = '';

// Экранирует текст для безопасной вставки в HTML.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Разбор hash: #/ , #/p/1 , #/p/1/r/2
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'backups') {
    return { page: 'backups' };
  }
  if (parts[0] === 'p' && parts[1] && parts[2] === 'r' && parts[3]) {
    return { page: 'records', projectId: parts[1], resourceId: parts[3] };
  }
  if (parts[0] === 'p' && parts[1]) {
    return { page: 'resources', projectId: parts[1] };
  }
  return { page: 'projects' };
}

// Публичный origin без слэша на конце.
function publicOrigin() {
  return location.origin;
}

// Копирует строку в буфер и показывает вспышку.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash = 'Скопировано';
  } catch {
    flash = 'Не удалось скопировать';
  }
  await render();
}

// Байты в КБ/МБ для таблицы бэкапов.
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

// ISO-дата с сервера в локальные дату и время.
function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

// Скачивает файл бэкапа (не JSON).
async function downloadBackup(name) {
  const headers = {};
  if (password) headers.authorization = 'Basic ' + btoa('admin:' + password);
  const res = await fetch('/admin/api/backups/' + encodeURIComponent(name), { headers });
  if (!res.ok) throw new Error('Не удалось скачать бэкап');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Запрос к /admin/api. 401 → экран входа.
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (password) headers.authorization = 'Basic ' + btoa('admin:' + password);

  const res = await fetch('/admin/api' + path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Ошибка ' + res.status);
  }
  return data;
}

// Спрашивает сервер, включён ли пароль на /admin.
async function loadStatus() {
  const res = await fetch('/admin/api/status');
  const data = await res.json();
  passwordRequired = Boolean(data.passwordRequired);
}

// Шапка: «Выйти» только после входа. Если пароля на сервере нет — подсказка.
function renderHeader(crumbs) {
  let right = `<a href="#/backups">Бэкапы</a>`;
  if (passwordRequired && password) {
    right += '<button type="button" data-act="logout">Выйти</button>';
  } else if (!passwordRequired) {
    right += '<span class="muted-note">вход выключен — задайте ADMIN_PASSWORD в .env</span>';
  }
  return `
    <div class="top">
      <div>
        <div class="brand"><span class="danger">M</span>OCK.<span class="danger">R</span>EDCODE</div>
        <nav class="crumbs">${crumbs}</nav>
      </div>
      <div class="top-actions">${right}</div>
    </div>
    ${flash ? `<p class="flash">${escapeHtml(flash)}</p>` : ''}
  `;
}

// Форма входа: только пароль, без логина и без системного окна браузера.
function renderLogin(error) {
  document.body.classList.add('is-login');
  root.innerHTML = `
    <form class="login" id="login-form">
      <h1>Вход</h1>
      ${error ? `<p class="flash">${escapeHtml(error)}</p>` : ''}
      <label for="pass">Пароль</label>
      <input id="pass" name="password" type="password" autocomplete="current-password" autofocus />
      <div class="modal-actions">
        <button class="primary" type="submit">Войти</button>
      </div>
    </form>
  `;
  bindLoginForm();
}

// Страница снимков SQLite: создать, скачать, удалить.
function renderBackups(items) {
  const rows = items
    .map(
      (b) => `<tr>
        <td>${escapeHtml(formatWhen(b.createdAt))}</td>
        <td class="mono">${escapeHtml(b.name)}</td>
        <td>${escapeHtml(formatSize(b.size))}</td>
        <td class="actions">
          <button type="button" class="linkish" data-act="restore-backup" data-name="${escapeHtml(b.name)}">Загрузить</button>
          <button type="button" class="linkish" data-act="download-backup" data-name="${escapeHtml(b.name)}">Скачать</button>
          <button type="button" class="linkish danger" data-act="del-backup" data-name="${escapeHtml(b.name)}">Удалить</button>
        </td>
      </tr>`
    )
    .join('');

  root.innerHTML =
    renderHeader('<a href="#/">Проекты</a> <span>/</span> <span>Бэкапы</span>') +
    `<div class="toolbar">
      <div>
        <h1>Бэкапы</h1>
        <p class="sub">«Загрузить» подменяет текущую базу (сначала сохранится снимок).</p>
      </div>
      <button type="button" class="primary" data-act="create-backup">Создать бэкап</button>
    </div>
    <div class="table-wrap">
      ${
        items.length
          ? `<table>
              <thead><tr><th>Дата</th><th>Файл</th><th>Размер</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : '<div class="empty">Снимков пока нет</div>'
      }
    </div>`;
}

// Вешает submit на форму входа (в том числе после неверного пароля).
function bindLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', onLoginSubmit);
}

// Проверяет пароль через /admin/api и открывает админку.
async function onLoginSubmit(e) {
  e.preventDefault();
  password = new FormData(e.target).get('password') || '';
  try {
    await api('/projects');
    sessionStorage.setItem(PASS_KEY, password);
    flash = '';
    await render();
  } catch (loginErr) {
    password = '';
    sessionStorage.removeItem(PASS_KEY);
    renderLogin(loginErr.code === 401 ? 'Неверный пароль' : loginErr.message);
  }
}

// Список проектов.
function renderProjects(projects) {
  const rows = projects
    .map((p) => {
      const url = `${publicOrigin()}/${p.token}/`;
      return `<tr>
        <td><a href="#/p/${p.id}">${escapeHtml(p.name)}</a></td>
        <td class="mono">${escapeHtml(p.token)}</td>
        <td class="mono">${escapeHtml(url)}</td>
        <td class="actions">
          <button type="button" class="linkish" data-act="edit-project" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-token="${escapeHtml(p.token)}">Изменить</button>
          <button type="button" class="linkish danger" data-act="del-project" data-id="${p.id}" data-name="${escapeHtml(p.name)}">Удалить</button>
        </td>
      </tr>`;
    })
    .join('');

  root.innerHTML =
    renderHeader('<span>Проекты</span>') +
    `<div class="toolbar">
      <h1>Проекты</h1>
      <button type="button" class="primary" data-act="new-project">Новый проект</button>
    </div>
    <div class="table-wrap">
      ${
        projects.length
          ? `<table>
              <thead><tr><th>Имя</th><th>Токен</th><th>Базовый URL</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : '<div class="empty">Пока нет проектов</div>'
      }
    </div>`;

  // клик по строке больше не нужен — имя это ссылка
}

// Список ресурсов проекта.
function renderResources(project, resources) {
  const rows = resources
    .map((r) => {
      const url = `${publicOrigin()}/${project.token}/${r.name}`;
      return `<tr>
        <td><a href="#/p/${project.id}/r/${r.id}">${escapeHtml(r.name)}</a></td>
        <td class="mono">${escapeHtml(url)}</td>
        <td class="actions">
          <button type="button" class="linkish" data-act="copy" data-text="${escapeHtml(url)}">URL</button>
          <button type="button" class="linkish" data-act="edit-resource" data-id="${r.id}" data-name="${escapeHtml(r.name)}">Изменить</button>
          <button type="button" class="linkish danger" data-act="del-resource" data-id="${r.id}" data-name="${escapeHtml(r.name)}">Удалить</button>
        </td>
      </tr>`;
    })
    .join('');

  root.innerHTML =
    renderHeader(
      `<a href="#/">Проекты</a> <span>/</span> <span>${escapeHtml(project.name)}</span>`
    ) +
    `<div class="toolbar">
      <div>
        <h1>${escapeHtml(project.name)}</h1>
        <p class="sub mono">${escapeHtml(project.token)}</p>
      </div>
      <button type="button" class="primary" data-act="new-resource">Новый ресурс</button>
    </div>
    <div class="table-wrap">
      ${
        resources.length
          ? `<table>
              <thead><tr><th>Ресурс</th><th>Публичный URL</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : '<div class="empty">Нет ресурсов</div>'
      }
    </div>`;
}

// Собирает колонки таблицы: id и все ключи JSON по всем записям.
function recordColumns(list) {
  const keys = new Set();
  for (const row of list) {
    for (const key of Object.keys(row)) {
      if (key !== 'id') keys.add(key);
    }
  }
  return ['id', ...keys];
}

// Ячейка таблицы: объекты — как JSON, остальное строкой.
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Таблица записей и кнопки JSON-редактора.
function renderRecords(project, resource, list) {
  const url = `${publicOrigin()}/${project.token}/${resource.name}`;
  const cols = recordColumns(list);
  const rows = list
    .map((row) => {
      const cells = cols
        .map((col) => `<td class="${col === 'id' ? 'mono' : ''}">${
          escapeHtml(cellText(row[col])).length < 40 ? 
          escapeHtml(cellText(row[col])) : 
          escapeHtml(cellText(row[col])).substring(0, 40) + "..." 
        }</td>`)
        .join('');
      return `<tr>
        ${cells}
        <td class="actions">
          <button type="button" class="linkish" data-act="edit-record" data-id="${escapeHtml(row.id)}">Изменить</button>
          <button type="button" class="linkish danger" data-act="del-record" data-id="${escapeHtml(row.id)}">Удалить</button>
        </td>
      </tr>`;
    })
    .join('');

  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '<th></th>';

  root.innerHTML =
    renderHeader(
      `<a href="#/">Проекты</a> <span>/</span>
       <a href="#/p/${project.id}">${escapeHtml(project.name)}</a> <span>/</span>
       <span>${escapeHtml(resource.name)}</span>`
    ) +
    `<div class="toolbar">
      <div>
        <h1>/${escapeHtml(resource.name)}</h1>
        <p class="sub mono">${escapeHtml(url)}</p>
      </div>
      <button type="button" class="linkish" data-act="copy" data-text="${escapeHtml(url)}">Копировать URL</button>
      <button type="button" data-act="edit-collection">Редактировать JSON</button>
      <button type="button" class="primary" data-act="new-record">Новая запись</button>
    </div>
    <div class="table-wrap">
      ${
        list.length
          ? `<table>
              <thead><tr>${head}</tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : '<div class="empty">Записей нет — добавьте JSON</div>'
      }
    </div>`;
}

// Модалка с произвольными полями. onSubmit(fields) → закрыть если не бросила.
function openModal({ title, fields, submitLabel, onSubmit, wide }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const inputs = fields
    .map((f) => {
      if (f.type === 'textarea') {
        return `<label>${escapeHtml(f.label)}</label>
          <textarea name="${f.name}" class="${f.tall ? 'tall' : ''}" ${f.required ? 'required' : ''}>${escapeHtml(f.value || '')}</textarea>
          ${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ''}`;
      }
      return `<label>${escapeHtml(f.label)}</label>
        <input name="${f.name}" type="text" value="${escapeHtml(f.value || '')}" ${f.required ? 'required' : ''} />
        ${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ''}`;
    })
    .join('');

  backdrop.innerHTML = `
    <form class="modal${wide ? ' wide' : ''}">
      <h2>${escapeHtml(title)}</h2>
      ${inputs}
      <div class="modal-actions">
        <button type="button" data-close>Отмена</button>
        <button class="primary" type="submit">${escapeHtml(submitLabel || 'Сохранить')}</button>
      </div>
    </form>
  `;

  const form = backdrop.querySelector('form');
  backdrop.querySelector('[data-close]').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    for (const el of form.elements) {
      if (el.name) data[el.name] = el.value;
    }
    try {
      await onSubmit(data);
      backdrop.remove();
      await render();
    } catch (err) {
      flash = err.message;
      const old = form.querySelector('.flash');
      if (old) old.remove();
      form.insertAdjacentHTML('afterbegin', `<p class="flash">${escapeHtml(err.message)}</p>`);
    }
  });

  document.body.appendChild(backdrop);
  const first = form.querySelector('input, textarea');
  if (first) first.focus();
}

// Разбирает JSON-объект из текстового поля редактора.
function parseJsonObject(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Невалидный JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Нужен JSON-объект, не массив');
  }
  return value;
}

// Разбирает JSON-массив коллекции из редактора.
function parseJsonArray(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Невалидный JSON');
  }
  if (!Array.isArray(value)) {
    throw new Error('Нужен JSON-массив записей');
  }
  return value;
}

// Обработка кликов по data-act на текущем экране.
function bindActions(ctx) {
  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !root.contains(btn)) return;
    const act = btn.dataset.act;
    try {
      if (act === 'copy') return copyText(btn.dataset.text);
      if (act === 'logout') {
        password = '';
        sessionStorage.removeItem(PASS_KEY);
        flash = '';
        return render();
      }
      if (act === 'create-backup') {
        await api('/backups', { method: 'POST' });
        flash = 'Бэкап создан';
        return render();
      }
      if (act === 'download-backup') {
        await downloadBackup(btn.dataset.name);
        return;
      }
      if (act === 'restore-backup') {
        if (
          !confirm(
            'Заменить текущую базу файлом «' +
              btn.dataset.name +
              '»? Перед этим сохранится снимок нынешнего состояния.'
          )
        ) {
          return;
        }
        const result = await api('/backups/' + encodeURIComponent(btn.dataset.name) + '/restore', {
          method: 'POST',
        });
        flash = 'База загружена. Откат: ' + result.safetyBackup;
        return render();
      }
      if (act === 'del-backup') {
        if (!confirm('Удалить файл «' + btn.dataset.name + '» с диска сервера?')) return;
        await api('/backups/' + encodeURIComponent(btn.dataset.name), { method: 'DELETE' });
        flash = 'Бэкап удалён';
        return render();
      }
      if (act === 'new-project') {
        return openModal({
          title: 'Новый проект',
          fields: [
            { name: 'name', label: 'Имя', required: true },
            {
              name: 'token',
              label: 'Токен (необязательно)',
              hint: 'Латиница, цифры, _ и -. Если пусто — путь сгенерируется автоматически.',
            },
          ],
          submitLabel: 'Создать',
          onSubmit: (data) =>
            api('/projects', {
              method: 'POST',
              body: { name: data.name.trim(), token: data.token.trim() || undefined },
            }),
        });
      }
      if (act === 'edit-project') {
        return openModal({
          title: 'Проект',
          fields: [
            { name: 'name', label: 'Имя', required: true, value: btn.dataset.name },
            { name: 'token', label: 'Токен', required: true, value: btn.dataset.token },
          ],
          onSubmit: (data) =>
            api('/projects/' + btn.dataset.id, {
              method: 'PATCH',
              body: { name: data.name.trim(), token: data.token.trim() },
            }),
        });
      }
      if (act === 'del-project') {
        if (!confirm('Удалить проект «' + btn.dataset.name + '» со всеми данными?')) return;
        await api('/projects/' + btn.dataset.id, { method: 'DELETE' });
        flash = 'Проект удалён';
        return render();
      }
      if (act === 'new-resource') {
        return openModal({
          title: 'Новый ресурс',
          fields: [
            {
              name: 'name',
              label: 'Имя',
              required: true,
              hint: 'Станет путём: /' + ctx.project.token + '/имя',
            },
          ],
          submitLabel: 'Создать',
          onSubmit: (data) =>
            api('/projects/' + ctx.project.id + '/resources', {
              method: 'POST',
              body: { name: data.name.trim() },
            }),
        });
      }
      if (act === 'edit-resource') {
        return openModal({
          title: 'Ресурс',
          fields: [{ name: 'name', label: 'Имя', required: true, value: btn.dataset.name }],
          onSubmit: (data) =>
            api('/projects/' + ctx.project.id + '/resources/' + btn.dataset.id, {
              method: 'PATCH',
              body: { name: data.name.trim() },
            }),
        });
      }
      if (act === 'del-resource') {
        if (!confirm('Удалить ресурс «' + btn.dataset.name + '» и все записи?')) return;
        await api('/projects/' + ctx.project.id + '/resources/' + btn.dataset.id, {
          method: 'DELETE',
        });
        flash = 'Ресурс удалён';
        return render();
      }
      if (act === 'edit-collection') {
        return openModal({
          title: 'Коллекция JSON',
          wide: true,
          fields: [
            {
              name: 'json',
              type: 'textarea',
              tall: true,
              label: 'Массив записей',
              value: JSON.stringify(ctx.records, null, 2),
              hint: 'Сохранение заменяет все записи.',
            },
          ],
          onSubmit: (data) =>
            api('/resources/' + ctx.resource.id + '/records', {
              method: 'PUT',
              body: parseJsonArray(data.json),
            }),
        });
      }
      if (act === 'new-record') {
        return openModal({
          title: 'Новая запись',
          fields: [
            {
              name: 'json',
              type: 'textarea',
              label: 'JSON',
              value: '{\n  \n}',
              hint: 'Поле id задает сервер.',
            },
          ],
          submitLabel: 'Создать',
          onSubmit: (data) =>
            api('/resources/' + ctx.resource.id + '/records', {
              method: 'POST',
              body: parseJsonObject(data.json),
            }),
        });
      }
      if (act === 'edit-record') {
        const row = ctx.records.find((r) => String(r.id) === String(btn.dataset.id));
        const { id, ...rest } = row;
        return openModal({
          title: 'Запись ' + id,
          fields: [
            {
              name: 'json',
              type: 'textarea',
              label: 'JSON',
              value: JSON.stringify(rest, null, 2),
            },
          ],
          onSubmit: (data) =>
            api('/resources/' + ctx.resource.id + '/records/' + id, {
              method: 'PUT',
              body: parseJsonObject(data.json),
            }),
        });
      }
      if (act === 'del-record') {
        if (!confirm('Удалить запись ' + btn.dataset.id + '?')) return;
        await api('/resources/' + ctx.resource.id + '/records/' + btn.dataset.id, {
          method: 'DELETE',
        });
        flash = 'Запись удалена';
        return render();
      }
    } catch (err) {
      if (err.code === 401) {
        password = '';
        sessionStorage.removeItem(PASS_KEY);
        return render();
      }
      flash = err.message;
      await render();
    }
  };
}

// Рисует текущий экран по hash.
async function render() {
  document.body.classList.remove('is-login');
  await loadStatus();
  if (passwordRequired && !password) {
    renderLogin('');
    return;
  }
  const shownFlash = flash;
  const route = parseRoute();
  try {
    if (route.page === 'projects') {
      const projects = await api('/projects');
      flash = shownFlash;
      renderProjects(projects);
      bindActions({});
      flash = '';
      return;
    }

    if (route.page === 'backups') {
      const items = await api('/backups');
      flash = shownFlash;
      renderBackups(items);
      bindActions({});
      flash = '';
      return;
    }

    const project = await api('/projects/' + route.projectId);
    if (route.page === 'resources') {
      const resources = await api('/projects/' + project.id + '/resources');
      flash = shownFlash;
      renderResources(project, resources);
      bindActions({ project });
      flash = '';
      return;
    }

    const resource = await api(
      '/projects/' + project.id + '/resources/' + route.resourceId
    );
    const list = await api('/resources/' + resource.id + '/records');
    flash = shownFlash;
    renderRecords(project, resource, list);
    bindActions({ project, resource, records: list });
    flash = '';
  } catch (err) {
    if (err.code === 401) {
      password = '';
      sessionStorage.removeItem(PASS_KEY);
      renderLogin('');
      return;
    }
    flash = err.message;
    if (route.page !== 'projects' && route.page !== 'backups') {
      location.hash = '#/';
      return;
    }
    root.innerHTML = renderHeader('<span>Проекты</span>') + `<p class="flash">${escapeHtml(err.message)}</p>`;
    flash = '';
  }
}

window.addEventListener('hashchange', () => {
  flash = '';
  render();
});

render();
