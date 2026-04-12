/**
 * Service Worker source for the browser runtime.
 * 
 * Note: This file is used as a reference / template. The actual SW is
 * emitted as plain JS by the CLI codegen (see cli.ts: emitServiceWorkerBundle).
 * 
 * Architecture:
 * - Main thread boots PGlite and holds the instance
 * - SW intercepts fetch, forwards /api/* requests to main thread via postMessage
 * - Main thread runs the query and replies with the response
 */

export const SERVICE_WORKER_SOURCE = `
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
