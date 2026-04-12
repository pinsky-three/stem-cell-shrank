#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseSpec } from "./codegen/parse-spec.js";
import { emitMigrations, emitReconcileStatements } from "./codegen/emit-migrations.js";
import { emitTypes } from "./codegen/emit-types.js";
import { emitCrud } from "./codegen/emit-crud.js";
import { emitRouter } from "./codegen/emit-router.js";
import { emitBrowserBundle } from "./codegen/emit-browser-bundle.js";

const command = process.argv[2] ?? "codegen";
const specsDir = resolve(process.argv[3] ?? "specs");

const selfYamlPath = join(specsDir, "self.yaml");
if (!existsSync(selfYamlPath)) {
  console.error(`[stem-cell] specs not found at ${selfYamlPath}`);
  process.exit(1);
}

const yamlStr = readFileSync(selfYamlPath, "utf-8");
const spec = parseSpec(yamlStr);

if (command === "codegen" || command === "serve") {
  const outDir = resolve("generated");
  mkdirSync(outDir, { recursive: true });

  const migrations = emitMigrations(spec);
  const reconcile = emitReconcileStatements(spec);

  // TypeScript artifacts (for dev tooling / reference)
  writeFileSync(join(outDir, "types.ts"), emitTypes(spec));
  writeFileSync(join(outDir, "crud.ts"), emitCrud(spec));
  writeFileSync(join(outDir, "router.ts"), emitRouter(spec));

  // Browser-ready JS bundle (single file, no imports)
  writeFileSync(join(outDir, "api.js"), emitBrowserBundle(spec));

  writeFileSync(
    join(outDir, "migrations.json"),
    JSON.stringify({ statements: migrations, reconcile }, null, 2),
  );

  const bootData = {
    migrations,
    reconcile,
    entityNames: spec.entities.map((e) => ({
      name: e.name,
      table: e.table,
    })),
  };
  writeFileSync(
    join(outDir, "boot-data.json"),
    JSON.stringify(bootData, null, 2),
  );

  emitServiceWorkerBundle(outDir);
  emitBrowserEntrypoint(outDir);

  console.log(
    `[stem-cell] codegen complete → ${outDir}/ (${spec.entities.length} entities)`,
  );
}

if (command === "serve") {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");

  const serveDir = resolve("generated");
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ts": "text/plain",
  };

  const port = parseInt(process.env.PORT ?? "3100", 10);
  const server = createServer(async (req, res) => {
    let pathname = new URL(req.url ?? "/", `http://localhost:${port}`).pathname;
    if (pathname === "/") pathname = "/index.html";

    const filePath = join(serveDir, pathname);
    try {
      const data = await readFile(filePath);
      const ext = pathname.substring(pathname.lastIndexOf("."));
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  server.listen(port, () => {
    console.log(
      `[stem-cell] browser runtime serving at http://localhost:${port}`,
    );
    console.log(
      `[stem-cell] open in browser to boot PGlite + Service Worker`,
    );
  });
}

function emitServiceWorkerBundle(outDir: string) {
  const sw = `// Auto-generated service worker for stem-cell browser runtime
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/api/")) return;
  event.respondWith(forwardToMainThread(event));
});

async function forwardToMainThread(event) {
  const clients = await self.clients.matchAll();
  const client = clients[0];
  if (!client) {
    return new Response(JSON.stringify({ error: "No active client" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body =
    event.request.method !== "GET" && event.request.method !== "HEAD"
      ? await event.request.text()
      : null;

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (msg) => {
      const { status, headers, body: respBody } = msg.data;
      resolve(new Response(respBody, { status, headers: new Headers(headers) }));
    };
    client.postMessage(
      {
        type: "api-request",
        url: event.request.url,
        method: event.request.method,
        headers: Object.fromEntries(event.request.headers.entries()),
        body,
      },
      [channel.port2],
    );
  });
}
`;
  writeFileSync(join(outDir, "sw.js"), sw);
}

function emitBrowserEntrypoint(outDir: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>stem-cell browser runtime</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background: #0a0a0a; color: #e5e5e5; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="app" class="mx-auto max-w-6xl px-6 py-12">
    <div id="loading" class="flex flex-col items-center justify-center min-h-[60vh]">
      <div class="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
      <p class="mt-4 text-neutral-500 text-sm" id="status-text">Initializing PGlite...</p>
    </div>
    <div id="dashboard" class="hidden"></div>
  </div>

  <script type="module">
    import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";
    import { handleRequest } from "./api.js";

    const statusEl = document.getElementById("status-text");

    // Load boot data
    statusEl.textContent = "Loading spec data...";
    const bootData = await fetch("./boot-data.json").then((r) => r.json());

    // Initialize PGlite
    statusEl.textContent = "Starting PGlite (Postgres in WASM)...";
    const db = new PGlite("idb://stem-cell-db");
    await db.waitReady;

    // Run migrations
    statusEl.textContent = "Running migrations...";
    for (const sql of bootData.migrations) {
      await db.exec(sql);
    }

    // Reconcile stale columns
    statusEl.textContent = "Reconciling schema...";
    for (const { table, expected } of bootData.reconcile) {
      const result = await db.query(
        "SELECT column_name::text as column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
        [table],
      );
      for (const row of result.rows) {
        if (!expected.includes(row.column_name)) {
          await db.exec(\`ALTER TABLE \${table} DROP COLUMN IF EXISTS \${row.column_name} CASCADE\`);
        }
      }
    }

    // Register service worker
    statusEl.textContent = "Registering service worker...";
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      await navigator.serviceWorker.ready;

      // Bridge: handle API requests from service worker
      navigator.serviceWorker.addEventListener("message", async (event) => {
        if (event.data?.type !== "api-request") return;
        const port = event.ports[0];
        if (!port) return;

        const { url, method, headers, body } = event.data;
        const request = new Request(url, {
          method,
          headers: new Headers(headers),
          body: body ?? undefined,
        });

        let response;
        try {
          response = await handleRequest(db, request);
          if (!response) {
            response = new Response(JSON.stringify({ error: "Not Found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (err) {
          response = new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        port.postMessage({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        });
      });
    }

    // Show dashboard
    statusEl.textContent = "Ready!";
    document.getElementById("loading").classList.add("hidden");
    const dashboard = document.getElementById("dashboard");
    dashboard.classList.remove("hidden");

    const entities = bootData.entityNames;
    dashboard.innerHTML = \`
      <h1 class="text-3xl font-bold tracking-tight">stem-cell Browser Runtime</h1>
      <p class="mt-2 text-sm text-neutral-500">Running Postgres (PGlite) in your browser — \${entities.length} entities loaded from specs/self.yaml</p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        \${entities
          .map(
            (e) => \`
          <div class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 transition hover:border-indigo-600/40">
            <h3 class="text-lg font-semibold">\${e.name}</h3>
            <p id="count-\${e.table}" class="mt-2 text-2xl font-bold text-indigo-400">...</p>
            <p class="mt-1 text-xs text-neutral-500">/api/\${e.table}</p>
            <button class="mt-3 text-xs text-indigo-400 hover:underline" onclick="testEntity('\${e.table}')">test fetch</button>
          </div>
        \`,
          )
          .join("")}
      </div>
      <pre id="test-output" class="mt-8 hidden overflow-auto rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-xs text-neutral-300 max-h-96"></pre>
    \`;

    // Fetch counts via direct PGlite queries (no SW round-trip needed on boot)
    for (const e of entities) {
      try {
        const countRes = await db.query(\`SELECT COUNT(*)::bigint as count FROM \${e.table} WHERE 1=1${spec.config.soft_delete ? " AND deleted_at IS NULL" : ""}\`);
        const total = Number(countRes.rows[0]?.count ?? 0);
        document.getElementById(\`count-\${e.table}\`).textContent = total + " records";
      } catch {
        document.getElementById(\`count-\${e.table}\`).textContent = "--";
      }
    }

    window.testEntity = async function (table) {
      const output = document.getElementById("test-output");
      output.classList.remove("hidden");
      output.textContent = "Fetching /api/" + table + " via service worker...";
      try {
        const res = await fetch("/api/" + table);
        const data = await res.json();
        output.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        output.textContent = "Error: " + err.message;
      }
    };
  <\/script>
</body>
</html>
`;
  writeFileSync(join(outDir, "index.html"), html);
}
