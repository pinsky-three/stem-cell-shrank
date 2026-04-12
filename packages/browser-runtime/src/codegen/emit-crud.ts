import type { Spec, EntitySpec, FieldSpec } from "./parse-spec.js";

function toSnakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Builds the full column list for SELECTs:
 * id, field1, field2, ..., created_at, updated_at [, deleted_at]
 */
function fullColumnList(entity: EntitySpec, softDelete: boolean): string {
  const cols = [
    entity.id.name,
    ...entity.fields.map((f) => f.name),
    "created_at",
    "updated_at",
  ];
  if (softDelete) cols.push("deleted_at");
  return cols.join(", ");
}

function sdClause(softDelete: boolean): string {
  return softDelete ? " AND deleted_at IS NULL" : "";
}

function emitCrudForEntity(entity: EntitySpec, softDelete: boolean): string {
  const name = entity.name;
  const table = entity.table;
  const idName = entity.id.name;
  const fullCols = fullColumnList(entity, softDelete);
  const sd = sdClause(softDelete);

  const userCols = entity.fields.map((f) => f.name);
  const insertCols = [idName, ...userCols];
  const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
  const insertColList = insertCols.join(", ");

  const setClauses = entity.fields
    .map((f, i) => `${f.name} = COALESCE($${i + 2}, ${f.name})`)
    .join(", ");

  const updateSql = `UPDATE ${table} SET ${setClauses}, updated_at = now() WHERE ${idName} = $1${sd} RETURNING ${fullCols}`;

  const deleteSql = softDelete
    ? `UPDATE ${table} SET deleted_at = now() WHERE ${idName} = $1 AND deleted_at IS NULL`
    : `DELETE FROM ${table} WHERE ${idName} = $1`;

  const insertBinds = entity.fields
    .map((f) => `    input.${f.name}`)
    .join(",\n");

  const updateBinds = entity.fields
    .map((f) => `    input.${f.name} ?? null`)
    .join(",\n");

  return `
// ── ${name} ──────────────────────────────────────────────────────
export async function list${name}s(
  db: PGlite,
  params: ListParams,
  filters?: Record<string, string>,
  sort?: string,
  order?: "asc" | "desc",
): Promise<ListResult<${name}>> {
  let whereClauses = "WHERE 1=1${sd}";
  const values: unknown[] = [];
  let paramIdx = 1;

  if (filters) {
    for (const [key, val] of Object.entries(filters)) {
      if (key.endsWith("__contains")) {
        const col = key.replace("__contains", "");
        whereClauses += \` AND \${col} ILIKE $\${paramIdx}\`;
        values.push(\`%\${val}%\`);
        paramIdx++;
      } else {
        whereClauses += \` AND \${key} = $\${paramIdx}\`;
        values.push(val);
        paramIdx++;
      }
    }
  }

  const validSorts = [${userCols.map((c) => `"${c}"`).join(", ")}, "created_at", "updated_at"];
  const orderBy = sort && validSorts.includes(sort) ? sort : "${idName}";
  const dir = order === "desc" ? "DESC" : "ASC";

  const countResult = await db.query<{ count: string }>(
    \`SELECT COUNT(*)::bigint as count FROM ${table} \${whereClauses}\`,
    values,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const limitIdx = paramIdx++;
  const offsetIdx = paramIdx++;
  const rows = await db.query<${name}>(
    \`SELECT ${fullCols} FROM ${table} \${whereClauses} ORDER BY \${orderBy} \${dir} LIMIT $\${limitIdx} OFFSET $\${offsetIdx}\`,
    [...values, params.limit, params.offset],
  );

  return { rows: rows.rows, total };
}

export async function create${name}(
  db: PGlite,
  input: Create${name}Input,
): Promise<${name}> {
  const id = crypto.randomUUID();
  const result = await db.query<${name}>(
    \`INSERT INTO ${table} (${insertColList}) VALUES (${insertPlaceholders}) RETURNING ${fullCols}\`,
    [
    id,
${insertBinds}
    ],
  );
  return result.rows[0];
}

export async function get${name}(
  db: PGlite,
  id: string,
): Promise<${name} | null> {
  const result = await db.query<${name}>(
    \`SELECT ${fullCols} FROM ${table} WHERE ${idName} = $1${sd}\`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function update${name}(
  db: PGlite,
  id: string,
  input: Update${name}Input,
): Promise<${name} | null> {
  const result = await db.query<${name}>(
    \`${updateSql}\`,
    [
    id,
${updateBinds}
    ],
  );
  return result.rows[0] ?? null;
}

export async function delete${name}(
  db: PGlite,
  id: string,
): Promise<boolean> {
  const result = await db.query(
    \`${deleteSql}\`,
    [id],
  );
  return result.affectedRows !== undefined ? result.affectedRows > 0 : false;
}
`;
}

export function emitCrud(spec: Spec): string {
  const softDelete = spec.config.soft_delete ?? false;
  const parts: string[] = [];
  parts.push("// Auto-generated from specs/self.yaml — do not edit");
  parts.push("import type { PGlite } from '@electric-sql/pglite';");
  parts.push(
    "import type { ListParams, ListResult, " +
      spec.entities
        .flatMap((e) => [
          e.name,
          `Create${e.name}Input`,
          `Update${e.name}Input`,
        ])
        .join(", ") +
      " } from './types.js';"
  );
  parts.push("");

  for (const entity of spec.entities) {
    parts.push(emitCrudForEntity(entity, softDelete));
  }

  return parts.join("\n");
}
