import type { Spec, EntitySpec } from "./parse-spec.js";

function toSnakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function emitRouter(spec: Spec): string {
  const parts: string[] = [];
  parts.push("// Auto-generated from specs/self.yaml — do not edit");
  parts.push("import type { PGlite } from '@electric-sql/pglite';");

  const crudImports = spec.entities.flatMap((e) => [
    `list${e.name}s`,
    `create${e.name}`,
    `get${e.name}`,
    `update${e.name}`,
    `delete${e.name}`,
  ]);
  parts.push(`import { ${crudImports.join(", ")} } from './crud.js';`);
  parts.push("");

  parts.push(`export type RouteHandler = (`);
  parts.push(`  db: PGlite,`);
  parts.push(`  request: Request,`);
  parts.push(`  params: { id?: string },`);
  parts.push(`) => Promise<Response>;`);
  parts.push("");

  parts.push(`export interface Route {`);
  parts.push(`  pattern: RegExp;`);
  parts.push(`  GET?: RouteHandler;`);
  parts.push(`  POST?: RouteHandler;`);
  parts.push(`  PUT?: RouteHandler;`);
  parts.push(`  PATCH?: RouteHandler;`);
  parts.push(`  DELETE?: RouteHandler;`);
  parts.push(`}`);
  parts.push("");

  parts.push(`function json(data: unknown, status = 200): Response {`);
  parts.push(`  return new Response(JSON.stringify(data), {`);
  parts.push(`    status,`);
  parts.push(`    headers: { "Content-Type": "application/json" },`);
  parts.push(`  });`);
  parts.push(`}`);
  parts.push("");

  parts.push(`function parseListParams(url: URL): { limit: number; offset: number; filters: Record<string, string>; sort?: string; order?: "asc" | "desc" } {`);
  parts.push(`  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 200);`);
  parts.push(`  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);`);
  parts.push(`  const sort = url.searchParams.get("sort") ?? undefined;`);
  parts.push(`  const order = url.searchParams.get("order") === "desc" ? "desc" : "asc";`);
  parts.push(`  const filters: Record<string, string> = {};`);
  parts.push(`  for (const [k, v] of url.searchParams.entries()) {`);
  parts.push(`    if (!["limit", "offset", "sort", "order"].includes(k)) filters[k] = v;`);
  parts.push(`  }`);
  parts.push(`  return { limit, offset, filters, sort, order };`);
  parts.push(`}`);
  parts.push("");

  for (const entity of spec.entities) {
    parts.push(emitEntityRoutes(entity));
  }

  parts.push(`export function buildRoutes(): Route[] {`);
  parts.push(`  return [`);
  for (const entity of spec.entities) {
    const table = entity.table;
    parts.push(
      `    { pattern: /^\\/api\\/${table}\\/([0-9a-f-]+)$/, GET: get${entity.name}Handler, PUT: update${entity.name}Handler, PATCH: update${entity.name}Handler, DELETE: delete${entity.name}Handler },`
    );
    parts.push(
      `    { pattern: /^\\/api\\/${table}\\/?$/, GET: list${entity.name}Handler, POST: create${entity.name}Handler },`
    );
  }
  parts.push(`  ];`);
  parts.push(`}`);
  parts.push("");

  parts.push(`export async function handleRequest(db: PGlite, request: Request): Promise<Response | null> {`);
  parts.push(`  const url = new URL(request.url);`);
  parts.push(`  const routes = buildRoutes();`);
  parts.push(`  for (const route of routes) {`);
  parts.push(`    const match = url.pathname.match(route.pattern);`);
  parts.push(`    if (match) {`);
  parts.push(`      const method = request.method as keyof Route;`);
  parts.push(`      const handler = route[method] as RouteHandler | undefined;`);
  parts.push(`      if (handler) {`);
  parts.push(`        try {`);
  parts.push(`          return await handler(db, request, { id: match[1] });`);
  parts.push(`        } catch (err) {`);
  parts.push(`          const msg = err instanceof Error ? err.message : "Internal Server Error";`);
  parts.push(`          return json({ error: msg }, 500);`);
  parts.push(`        }`);
  parts.push(`      }`);
  parts.push(`      return json({ error: "Method Not Allowed" }, 405);`);
  parts.push(`    }`);
  parts.push(`  }`);
  parts.push(`  return null;`);
  parts.push(`}`);

  return parts.join("\n");
}

function emitEntityRoutes(entity: EntitySpec): string {
  const name = entity.name;
  const table = entity.table;

  return `
const list${name}Handler: RouteHandler = async (db, request) => {
  const url = new URL(request.url);
  const { limit, offset, filters, sort, order } = parseListParams(url);
  const result = await list${name}s(db, { limit, offset }, filters, sort, order);
  return new Response(JSON.stringify(result.rows), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-total-count": String(result.total),
    },
  });
};

const create${name}Handler: RouteHandler = async (db, request) => {
  const body = await request.json();
  const entity = await create${name}(db, body);
  return json(entity, 201);
};

const get${name}Handler: RouteHandler = async (db, _request, params) => {
  const entity = await get${name}(db, params.id!);
  if (!entity) return json({ error: "Not Found" }, 404);
  return json(entity);
};

const update${name}Handler: RouteHandler = async (db, request, params) => {
  const body = await request.json();
  const entity = await update${name}(db, params.id!, body);
  if (!entity) return json({ error: "Not Found" }, 404);
  return json(entity);
};

const delete${name}Handler: RouteHandler = async (db, _request, params) => {
  const ok = await delete${name}(db, params.id!);
  if (!ok) return json({ error: "Not Found" }, 404);
  return json({ deleted: true });
};
`;
}
