import { PGlite } from "@electric-sql/pglite";

/**
 * Boot sequence for the browser runtime:
 * 1. Initialize PGlite (IndexedDB-backed)
 * 2. Run additive migrations
 * 3. Reconcile stale columns
 * 4. Register Service Worker
 * 5. Wire SW <-> main thread message bridge for /api/* requests
 */
export interface BootOptions {
  migrations: string[];
  reconcile: { table: string; expected: string[] }[];
  handleRequest: (
    db: PGlite,
    request: Request,
  ) => Promise<Response | null>;
  dataDir?: string;
  swUrl?: string;
}

export async function boot(opts: BootOptions): Promise<PGlite> {
  const db = new PGlite(opts.dataDir ?? "idb://stem-cell-db");
  await db.waitReady;

  // Phase 1: additive migrations
  for (const sql of opts.migrations) {
    await db.exec(sql);
  }

  // Phase 2: reconcile stale columns
  for (const { table, expected } of opts.reconcile) {
    const result = await db.query<{ column_name: string }>(
      `SELECT column_name::text as column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
      [table],
    );
    for (const row of result.rows) {
      if (!expected.includes(row.column_name)) {
        await db.exec(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${row.column_name} CASCADE`,
        );
      }
    }
  }

  // Register service worker (browser only)
  if (
    typeof globalThis !== "undefined" &&
    "navigator" in globalThis &&
    "serviceWorker" in navigator
  ) {
    const swUrl = opts.swUrl ?? "/sw.js";
    await navigator.serviceWorker.register(swUrl, { scope: "/" });
    await navigator.serviceWorker.ready;

    navigator.serviceWorker.addEventListener(
      "message",
      async (event: MessageEvent) => {
        if (event.data?.type !== "api-request") return;

        const { url, method, headers, body } = event.data;
        const port = (event as MessageEvent).ports[0];
        if (!port) return;

        const request = new Request(url, {
          method,
          headers: new Headers(headers),
          body: body ?? undefined,
        });

        let response: Response;
        try {
          const result = await opts.handleRequest(db, request);
          response =
            result ??
            new Response(JSON.stringify({ error: "Not Found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Internal Server Error";
          response = new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        port.postMessage({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        });
      },
    );

    console.log("[stem-cell] Service worker registered, API bridge active");
  }

  return db;
}
