import { PGlite } from "@electric-sql/pglite";

let instance: PGlite | null = null;

/**
 * Singleton PGlite instance backed by IndexedDB for persistence.
 * In Node.js (CLI) mode, falls back to an in-memory database.
 */
export async function getDb(
  dataDir?: string,
): Promise<PGlite> {
  if (instance) return instance;
  instance = new PGlite(dataDir ?? "idb://stem-cell-db");
  await instance.waitReady;
  return instance;
}

export async function resetDb(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
