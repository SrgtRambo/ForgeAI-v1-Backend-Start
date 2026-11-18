// Custom business application generator.
// Produces a functional Node.js app with Express, SQLite, CRUD operations, auth stubs.
export function createAppSpec({ name, description, entities, features }) {
  const app = {
    name: name || "Business App",
    description: description || "",
    entities: entities || [
      { name: "Item", fields: [{ name: "name", type: "text", required: true }, { name: "description", type: "text" }, { name: "status", type: "select", options: ["Active", "Inactive", "Pending"] }, { name: "created_at", type: "date", auto: true }] },
    ],
    features: features || ["crud", "search", "filter", "export", "dashboard"],
    files: {},
  };

  // Generate package.json
  app.files["package.json"] = JSON.stringify({
    name: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    version: "1.0.0",
    type: "module",
    scripts: { start: "node src/server.js", dev: "node --watch src/server.js" },
    dependencies: { express: "^4.21.0", "better-sqlite3": "^11.0.0", cors: "^2.8.5" },
  }, null, 2);

  // Generate server.js
  const entityCode = app.entities.map((e) => {
    const tableName = e.name.toLowerCase() + "s";
    const fieldDefs = e.fields.map((f) => `${f.name} ${f.type === "number" ? "REAL" : "TEXT"}`).join(", ");
    return `
// ${e.name} CRUD
app.get('/api/${tableName}', (req, res) => {
  const rows = db.prepare('SELECT * FROM ${tableName} ORDER BY created_at DESC').all();
  res.json(rows);
});
app.post('/api/${tableName}', (req, res) => {
  const { ${e.fields.filter(f => !f.auto).map(f => f.name).join(", ")} } = req.body;
  const stmt = db.prepare('INSERT INTO ${tableName} (${e.fields.filter(f => !f.auto).map(f => f.name).join(", ")}, created_at) VALUES (${e.fields.filter(f => !f.auto).map(() => "?").join(", ")}, ?)');
  const result = stmt.run(${e.fields.filter(f => !f.auto).map(f => f.name).join(", ")}, new Date().toISOString());
  res.json({ id: result.lastInsertRowid });
});
app.put('/api/${tableName}/:id', (req, res) => {
  const { ${e.fields.filter(f => !f.auto).map(f => f.name).join(", ")} } = req.body;
  db.prepare('UPDATE ${tableName} SET ${e.fields.filter(f => !f.auto).map(f => f.name + " = ?").join(", ")} WHERE id = ?').run(${e.fields.filter(f => !f.auto).map(f => f.name).join(", ")}, req.params.id);
  res.json({ updated: true });
});
app.delete('/api/${tableName}/:id', (req, res) => {
  db.prepare('DELETE FROM ${tableName} WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});`;
  }).join("\n");

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
${app.entities.map((e) => {
  const tableName = e.name.toLowerCase() + "s";
  const fieldDefs = e.fields.map((f) => `${f.name} ${f.type === "number" ? "REAL" : "TEXT"}${f.required ? " NOT NULL" : ""}`).join(", ");
  return `db.exec(\`CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${fieldDefs})\`);`;
}).join("\n")}

${entityCode}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 3000, () => console.log('${app.name} running on port', process.env.PORT || 3000));
`;

  // Generate index.html
  app.files["public/index.html"] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${app.name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto p-6">
    <h1 class="text-3xl font-bold mb-6">${app.name}</h1>
    <p class="text-gray-600 mb-6">${app.description}</p>
    ${app.entities.map((e) => {
      const tableName = e.name.toLowerCase() + "s";
      return `
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">${e.name} Management</h2>
      <div id="${tableName}-list" class="space-y-2"></div>
      <button onclick="addItem('${tableName}')" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Add ${e.name}</button>
    </div>`;
    }).join("\n")}
  </div>
  <script>
    async function loadItems(table) {
      const res = await fetch('/api/' + table);
      const items = await res.json();
      document.getElementById(table + '-list').innerHTML = items.map(i => 
        '<div class="p-3 border rounded flex justify-between"><span>' + (i.name || i.id) + '</span><button onclick="deleteItem(\\'' + table + '\\',' + i.id + ')" class="text-red-500">Delete</button></div>'
      ).join('');
    }
    async function addItem(table) {
      const name = prompt('Enter name:');
      if (!name) return;
      await fetch('/api/' + table, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      loadItems(table);
    }
    async function deleteItem(table, id) {
      await fetch('/api/' + table + '/' + id, { method: 'DELETE' });
      loadItems(table);
    }
    ${app.entities.map((e) => `loadItems('${e.name.toLowerCase()}s');`).join("\n    ")}
  </script>
</body>
</html>`;

  app.files["README.md"] = `# ${app.name}\n\n${app.description}\n\n## Run\n\nnpm install\nnpm start\n\nGenerated by Forge AI.`;

  return app;
}
