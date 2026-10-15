"use strict";

// Server-side proxy: the Render staging gate password never reaches the browser.
const config = { api: { bodyParser: false } };

const hopByHop = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "set-cookie",
]);

async function requestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function handler(request, response) {
  response.setHeader("X-Hub-Proxy", "render-v1");
  response.setHeader("Cache-Control", "no-store");
  const backend = (process.env.RENDER_BACKEND_URL || "").replace(/\/$/, "");
  const password = process.env.STAGING_ACCESS_PASSWORD || "";
  if (!backend || !password) {
    response
      .status(503)
      .json({ detail: "Proxy da homologação não configurado" });
    return;
  }

  const incoming = new URL(request.url, "https://frontend.invalid");
  let target;
  try {
    target = new URL(backend);
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash
    )
      throw new Error("Invalid backend origin");
  } catch {
    response
      .status(503)
      .json({
        detail:
          "RENDER_BACKEND_URL deve conter somente a origem HTTPS do backend",
      });
    return;
  }
  // Explicit Vercel rewrite works with the framework-free static frontend.
  // Some runtimes retain the original URL; others expose the rewritten URL.
  const path = incoming.pathname.startsWith("/api/v1/")
    ? incoming.pathname.slice("/api/v1/".length)
    : (request.query?.__hub_path ?? incoming.searchParams.get("__hub_path"));
  if (
    typeof path !== "string" ||
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)
  ) {
    response.status(404).json({ detail: "Rota da API não encontrada" });
    return;
  }
  target.pathname = "/api/v1/" + path;
  incoming.searchParams.delete("__hub_path");
  target.search = incoming.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase();
    if (hopByHop.has(lower) || lower === "authorization") continue;
    if (typeof value === "string") headers.set(key, value);
  }
  headers.set(
    "authorization",
    "Basic " + Buffer.from("tester:" + password, "utf8").toString("base64"),
  );

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: await requestBody(request),
      redirect: "manual",
    });
  } catch {
    response.status(502).json({ detail: "Backend indisponível" });
    return;
  }

  response.status(upstream.status);
  for (const [key, value] of upstream.headers) {
    if (!hopByHop.has(key.toLowerCase())) response.setHeader(key, value);
  }
  const cookies = upstream.headers.getSetCookie?.() || [];
  if (cookies.length) response.setHeader("set-cookie", cookies);
  response.send(Buffer.from(await upstream.arrayBuffer()));
}

module.exports = handler;
module.exports.config = config;
