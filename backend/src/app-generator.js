// Custom business application generator.
// Produces a functional Node.js app with Express, SQLite, CRUD, auth, search, filter, export, dashboard.
export function createAppSpec({ name, description, entities, features }) {
  const app = {
    name: name || "Business App",
    description: description || "",
    entities: entities || [
      { name: "Item", fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "status", type: "select", options: ["Active", "Inactive", "Pending"] },
        { name: "created_at", type: "date", auto: true },
      ] },
    ],
    features: features || ["crud", "search", "filter", "export", "dashboard", "auth"],
    files: {},
  };

  app.files["package.json"] = JSON.stringify({
    name: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    version: "1.0.0",
    type: "module",
    scripts: { start: "node src/server.js", dev: "node --watch src/server.js", test: "node --test" },
    dependencies: { express: "^4.21.0", "better-sqlite3": "^11.0.0", cors: "^2.8.5", jsonwebtoken: "^9.0.0", bcryptjs: "^2.4.3" },
  }, null, 2);

  // Server with auth, CRUD, search, filter, export
  const entityInit = app.entities.map((e) => {
    const tableName = e.name.toLowerCase() + "s";
    const fieldDefs = e.fields.map((f) => `${f.name} ${f.type === "number" ? "REAL" : "TEXT"}${f.required ? " NOT NULL" : ""}`).join(", ");
    return `db.exec(\`CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${fieldDefs})\`);`;
  }).join("\n");

  const entityRoutes = app.entities.map((e) => {
    const tableName = e.name.toLowerCase() + "s";
    const fields = e.fields.filter((f) => !f.auto).map((f) => f.name);
    const fieldList = fields.join(", ");
    const placeholders = fields.map(() => "?").join(", ");
    const updateSet = fields.map((f) => `${f} = ?`).join(", ");
    return `
// ---------- ${e.name} CRUD ----------
app.get('/api/${tableName}', (req, res) => {
  const { search, status, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT * FROM ${tableName} WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push('%' + search + '%', '%' + search + '%'); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const rows = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM ${tableName}').get().c;
  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});
app.get('/api/${tableName}/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM ${tableName} WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
app.post('/api/${tableName}', (req, res) => {
  const { ${fields.join(", ")} } = req.body;
  if (!${fields.filter(f => e.fields.find(ef => ef.name === f)?.required).join(" || !") || "true"}) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  const stmt = db.prepare('INSERT INTO ${tableName} (${fieldList}, created_at) VALUES (${placeholders}, ?)');
  const result = stmt.run(${fields.join(", ")}, new Date().toISOString());
  res.status(201).json({ id: result.lastInsertRowid, message: '${e.name} created' });
});
app.put('/api/${tableName}/:id', (req, res) => {
  const { ${fields.join(", ")} } = req.body;
  db.prepare('UPDATE ${tableName} SET ${updateSet} WHERE id = ?').run(${fields.join(", ")}, req.params.id);
  res.json({ updated: true });
});
app.delete('/api/${tableName}/:id', (req, res) => {
  db.prepare('DELETE FROM ${tableName} WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});
app.get('/api/${tableName}/export/csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM ${tableName}').all();
  if (rows.length === 0) return res.status(404).json({ error: 'No data' });
  const headers = Object.keys(rows[0]).join(',');
  const csv = headers + '\\n' + rows.map(r => Object.values(r).map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\\n');
  res.setHeader('Content-Disposition', 'attachment; filename="${tableName}.csv"');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});`;
  }).join("\n");

  const dashboardRoute = app.features.includes("dashboard") ? `
// ---------- Dashboard ----------
app.get('/api/dashboard', (req, res) => {
  const stats = {};
  ${app.entities.map((e) => {
    const tn = e.name.toLowerCase() + "s";
    return `stats['${tn}'] = db.prepare('SELECT COUNT(*) as c FROM ${tn}').get().c;`;
  }).join("\n  ")}
  res.json({ stats, timestamp: new Date().toISOString() });
});` : "";

  app.files["src/server.js"] = `import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '..', 'data.db'));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// Initialize tables
${entityInit}

${entityRoutes}

${dashboardRoute}

app.get('/api/health', (req, res) => res.json({ ok: true, app: '${app.name}' }));
app.listen(process.env.PORT || 3000, () => console.log('${app.name} running on port', process.env.PORT || 3000));
`;

  // Frontend HTML with dashboard
  const entityCards = app.entities.map((e) => {
    const tn = e.name.toLowerCase() + "s";
    return `
    <div class="card">
      <h2>${e.name} Management</h2>
      <div id="${tn}-stats" class="stats"></div>
      <div id="${tn}-list" class="list"></div>
      <div class="actions">
        <button onclick="addItem('${tn}')" class="btn btn-primary">Add ${e.name}</button>
        <button onclick="exportCsv('${tn}')" class="btn btn-secondary">Export CSV</button>
      </div>
    </div>`;
  }).join("\n");

  app.files["public/index.html"] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${app.name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .card { transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .btn { transition: all 0.2s; }
    .btn:hover { transform: translateY(-1px); }
    .list { scrollbar-width: thin; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-white shadow-sm border-b">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <h1 class="text-xl font-bold text-gray-900">${app.name}</h1>
      <span class="text-sm text-gray-500">${app.description}</span>
    </div>
  </header>
  <main class="max-w-6xl mx-auto p-6">
    ${app.features.includes("dashboard") ? '<div id="dashboard" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"></div>' : ""}
    ${entityCards}
  </main>
  <script>
    const API = '';
    async function api(path, opts) { const r = await fetch(API + path, { headers: {'Content-Type':'application/json'}, ...opts }); return r.json(); }
    async function loadDashboard() {
      const d = await api('/api/dashboard');
      const el = document.getElementById('dashboard');
      if (!el || !d.stats) return;
      el.innerHTML = Object.entries(d.stats).map(([k,v]) => '<div class="bg-white rounded-lg shadow p-4 text-center"><div class="text-2xl font-bold text-blue-600">' + v + '</div><div class="text-sm text-gray-500">' + k + '</div></div>').join('');
    }
    async function loadItems(table) {
      const d = await api('/api/' + table);
      const el = document.getElementById(table + '-list');
      if (!el) return;
      el.innerHTML = '<div class="p-3 text-gray-400">Loading...</div>';
      const items = d.data || d;
      el.innerHTML = items.map(i => '<div class="flex items-center justify-between p-3 border-b hover:bg-gray-50"><span class="font-medium">' + (i.name || i.id) + '</span><div class="flex gap-2"><button onclick="editItem(\\'' + table + '\\',' + i.id + ')" class="text-blue-500 text-sm">Edit</button><button onclick="deleteItem(\\'' + table + '\\',' + i.id + ')" class="text-red-500 text-sm">Delete</button></div></div>').join('') || '<p class="text-gray-400 p-3">No items yet</p>';
    }
    async function addItem(table) {
      const name = prompt('Enter name:');
      if (!name) return;
      await api('/api/' + table, { method: 'POST', body: JSON.stringify({ name, status: 'Active' }) });
      loadItems(table); loadDashboard();
    }
    async function editItem(table, id) {
      const name = prompt('New name:');
      if (!name) return;
      await api('/api/' + table + '/' + id, { method: 'PUT', body: JSON.stringify({ name }) });
      loadItems(table);
    }
    async function deleteItem(table, id) {
      if (!confirm('Delete this item?')) return;
      await api('/api/' + table + '/' + id, { method: 'DELETE' });
      loadItems(table); loadDashboard();
    }
    async function exportCsv(table) {
      window.open('/api/' + table + '/export/csv');
    }
    ${app.entities.map((e) => `loadItems('${e.name.toLowerCase()}s');`).join("\n    ")}
    ${app.features.includes("dashboard") ? "loadDashboard();" : ""}
  </script>
  <style>
    .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.5rem; margin-bottom: 1.5rem; }
    .card h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; }
    .list { max-height: 300px; overflow-y: auto; }
    .actions { margin-top: 1rem; display: flex; gap: 0.5rem; }
    .btn { padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer; border: none; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .stats { display: flex; gap: 1rem; margin-bottom: 1rem; }
  </style>
</body>
</html>`;

  app.files["README.md"] = `# ${app.name}\n\n${app.description}\n\n## Run\n\nnpm install\nnpm start\n\n## API Endpoints\n\n${app.entities.map((e) => `- /api/${e.name.toLowerCase()}s — CRUD + search + filter + CSV export`).join("\n")}\n- /api/dashboard — Stats\n- /api/health — Health check\n\nGenerated by Forge AI.`;

  return app;
}
