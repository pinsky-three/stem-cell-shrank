import type { Spec, EntitySpec } from "./parse-spec.js";

/**
 * Emits a self-contained `api.js` ES module for the browser.
 * It exports a single `handleRequest(db, request)` function that
 * routes /api/* requests to PGlite-backed CRUD handlers.
 *
 * No TypeScript, no external imports — receives PGlite instance as argument.
 */
export function emitBrowserBundle(spec: Spec): string {
  const softDelete = spec.config.soft_delete ?? false;
  const sd = softDelete ? " AND deleted_at IS NULL" : "";

  const parts: string[] = [];
  parts.push("// Auto-generated browser API module — do not edit");
  parts.push("// Receives PGlite db instance via handleRequest(db, request)");
  parts.push("");

  // Utility
  parts.push(`function json(data, status = 200) {`);
  parts.push(`  return new Response(JSON.stringify(data), {`);
  parts.push(`    status,`);
  parts.push(`    headers: { "Content-Type": "application/json" },`);
  parts.push(`  });`);
  parts.push(`}`);
  parts.push("");

  parts.push(`function jsonWithTotal(data, total, status = 200) {`);
  parts.push(`  return new Response(JSON.stringify(data), {`);
  parts.push(`    status,`);
  parts.push(`    headers: { "Content-Type": "application/json", "x-total-count": String(total) },`);
  parts.push(`  });`);
  parts.push(`}`);
  parts.push("");

  // CRUD for each entity
  for (const entity of spec.entities) {
    parts.push(emitEntityCrud(entity, softDelete));
  }

  // Route table
  parts.push(`const routes = [`);
  for (const entity of spec.entities) {
    const t = entity.table;
    const n = entity.name;
    parts.push(
      `  { pattern: /^\\/api\\/${t}\\/([0-9a-f-]+)$/, GET: get${n}, PUT: update${n}, PATCH: update${n}, DELETE: delete${n} },`
    );
    parts.push(
      `  { pattern: /^\\/api\\/${t}\\/?$/, GET: list${n}s, POST: create${n} },`
    );
  }
  parts.push(`];`);
  parts.push("");

  // handleRequest
  parts.push(`export async function handleRequest(db, request) {`);
  parts.push(`  const url = new URL(request.url);`);
  parts.push(`  for (const route of routes) {`);
  parts.push(`    const match = url.pathname.match(route.pattern);`);
  parts.push(`    if (match) {`);
  parts.push(`      const handler = route[request.method];`);
  parts.push(`      if (handler) {`);
  parts.push(`        try {`);
  parts.push(`          return await handler(db, request, match[1]);`);
  parts.push(`        } catch (err) {`);
  parts.push(`          return json({ error: err.message || "Internal Server Error" }, 500);`);
  parts.push(`        }`);
  parts.push(`      }`);
  parts.push(`      return json({ error: "Method Not Allowed" }, 405);`);
  parts.push(`    }`);
  parts.push(`  }`);
  parts.push(`  return null;`);
  parts.push(`}`);

  return parts.join("\n");
}

function emitEntityCrud(entity: EntitySpec, softDelete: boolean): string {
  const name = entity.name;
  const table = entity.table;
  const idName = entity.id.name;
  const sd = softDelete ? " AND deleted_at IS NULL" : "";

  const allCols = [
    idName,
    ...entity.fields.map((f) => f.name),
    "created_at",
    "updated_at",
  ];
  if (softDelete) allCols.push("deleted_at");
  const fullCols = allCols.join(", ");

  const userCols = entity.fields.map((f) => f.name);
  const insertCols = [idName, ...userCols];
  const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
  const insertColList = insertCols.join(", ");

  const setClauses = entity.fields
    .map((f, i) => `${f.name} = COALESCE($${i + 2}, ${f.name})`)
    .join(", ");

  const deleteSql = softDelete
    ? `UPDATE ${table} SET deleted_at = now() WHERE ${idName} = $1 AND deleted_at IS NULL`
    : `DELETE FROM ${table} WHERE ${idName} = $1`;

  const insertBinds = entity.fields
    .map((f) => `    body.${f.name}`)
    .join(",\n");

  const updateBinds = entity.fields
    .map((f) => `    body.${f.name} ?? null`)
    .join(",\n");

  const validSorts = [...userCols, "created_at", "updated_at"]
    .map((c) => `"${c}"`)
    .join(", ");

  return `
// ── ${name} ────────────────────────────────────
async function list${name}s(db, request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const sort = url.searchParams.get("sort");
  const order = url.searchParams.get("order") === "desc" ? "DESC" : "ASC";

  let where = "WHERE 1=1${sd}";
  const vals = [];
  let pi = 1;
  for (const [k, v] of url.searchParams.entries()) {
    if (["limit", "offset", "sort", "order"].includes(k)) continue;
    if (k.endsWith("__contains")) {
      where += \` AND \${k.replace("__contains", "")} ILIKE $\${pi}\`;
      vals.push(\`%\${v}%\`);
    } else {
      where += \` AND \${k} = $\${pi}\`;
      vals.push(v);
    }
    pi++;
  }

  const validSorts = [${validSorts}];
  const orderBy = sort && validSorts.includes(sort) ? sort : "${idName}";

  const countRes = await db.query(\`SELECT COUNT(*)::bigint as count FROM ${table} \${where}\`, vals);
  const total = Number(countRes.rows[0]?.count ?? 0);

  const li = pi++;
  const oi = pi++;
  const rows = await db.query(
    \`SELECT ${fullCols} FROM ${table} \${where} ORDER BY \${orderBy} \${order} LIMIT $\${li} OFFSET $\${oi}\`,
    [...vals, limit, offset],
  );
  return jsonWithTotal(rows.rows, total);
}

async function create${name}(db, request) {
  const body = await request.json();
  const id = crypto.randomUUID();
  const result = await db.query(
    \`INSERT INTO ${table} (${insertColList}) VALUES (${insertPlaceholders}) RETURNING ${fullCols}\`,
    [id,
${insertBinds}],
  );
  return json(result.rows[0], 201);
}

async function get${name}(db, request, id) {
  const result = await db.query(
    \`SELECT ${fullCols} FROM ${table} WHERE ${idName} = $1${sd}\`,
    [id],
  );
  if (!result.rows[0]) return json({ error: "Not Found" }, 404);
  return json(result.rows[0]);
}

async function update${name}(db, request, id) {
  const body = await request.json();
  const result = await db.query(
    \`UPDATE ${table} SET ${setClauses}, updated_at = now() WHERE ${idName} = $1${sd} RETURNING ${fullCols}\`,
    [id,
${updateBinds}],
  );
  if (!result.rows[0]) return json({ error: "Not Found" }, 404);
  return json(result.rows[0]);
}

async function delete${name}(db, request, id) {
  const result = await db.query(\`${deleteSql}\`, [id]);
  if (result.affectedRows === 0) return json({ error: "Not Found" }, 404);
  return json({ deleted: true });
}
`;
}
