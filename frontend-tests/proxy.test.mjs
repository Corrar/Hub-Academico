import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";

const handler = createRequire(import.meta.url)("../frontend/api/proxy.js");
const routing = JSON.parse(
  await readFile(new URL("../frontend/vercel.json", import.meta.url), "utf8"),
);

async function invoke(
  t,
  url,
  { method = "GET", body = "", query = {}, headers = {} } = {},
) {
  t.mock.method(globalThis, "fetch", async (target, init) => {
    calls.push({ url: new URL(target), init });
    return new Response(JSON.stringify({ local: true, microsoft: false }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "hub=test-session; HttpOnly; Secure; Path=/api/v1",
      },
    });
  });
  const oldBackend = process.env.RENDER_BACKEND_URL,
    oldPassword = process.env.STAGING_ACCESS_PASSWORD;
  process.env.RENDER_BACKEND_URL = "https://backend.example";
  process.env.STAGING_ACCESS_PASSWORD = "synthetic-gate-test-value";
  const calls = [],
    request = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
      url,
      method,
      query,
      headers,
    }),
    response = {
      headers: {},
      status(code) {
        this.code = code;
        return this;
      },
      setHeader(key, value) {
        this.headers[key.toLowerCase()] = value;
      },
      json(value) {
        this.body = value;
      },
      send(value) {
        this.body = value;
      },
    };
  try {
    await handler(request, response);
  } finally {
    if (oldBackend === undefined) delete process.env.RENDER_BACKEND_URL;
    else process.env.RENDER_BACKEND_URL = oldBackend;
    if (oldPassword === undefined) delete process.env.STAGING_ACCESS_PASSWORD;
    else process.env.STAGING_ACCESS_PASSWORD = oldPassword;
  }
  return { calls, response };
}

test("the explicit rewrite reaches the authentication endpoint with the Render gate", async (t) => {
  const rule = routing.rewrites.find(
    (rule) => rule.source === "/api/v1/:path*",
  );
  assert.ok(rule);
  const rewritten = rule.destination.replace(":path*", "auth/options");
  const { calls, response } = await invoke(t, rewritten);
  assert.equal(response.code, 200);
  assert.equal(
    calls[0].url.href,
    "https://backend.example/api/v1/auth/options",
  );
  assert.equal(
    calls[0].init.headers.get("authorization"),
    "Basic " +
      Buffer.from("tester:synthetic-gate-test-value").toString("base64"),
  );
  assert.equal(response.headers["x-hub-proxy"], "render-v1");
  assert.match(response.headers["set-cookie"][0], /HttpOnly/);
  assert.equal(
    response.body.toString().includes("synthetic-gate-test-value"),
    false,
  );
});

test("original route, filters, POST body, cookies and CSRF survive proxying", async (t) => {
  const { calls, response } = await invoke(
    t,
    "/api/v1/learning/publications?group_id=abc-123&__hub_path=ignored",
    {
      method: "POST",
      body: '{"title":"Teste"}',
      headers: {
        cookie: "hub=test-session",
        "x-csrf-token": "test-csrf",
        origin: "https://frontend.example",
        authorization: "Bearer untrusted",
        "content-type": "application/json",
      },
    },
  );
  assert.equal(response.code, 200);
  assert.equal(
    calls[0].url.href,
    "https://backend.example/api/v1/learning/publications?group_id=abc-123",
  );
  assert.equal(calls[0].init.body.toString(), '{"title":"Teste"}');
  assert.equal(calls[0].init.headers.get("cookie"), "hub=test-session");
  assert.equal(calls[0].init.headers.get("x-csrf-token"), "test-csrf");
  assert.equal(calls[0].init.headers.get("origin"), "https://frontend.example");
  assert.notEqual(
    calls[0].init.headers.get("authorization"),
    "Bearer untrusted",
  );
  assert.equal(calls[0].init.redirect, "manual");
});

test("rewritten query paths cannot leave the versioned backend API", async (t) => {
  const { calls, response } = await invoke(t, "/api/proxy", {
    query: { __hub_path: "../../admin" },
  });
  assert.equal(response.code, 404);
  assert.equal(calls.length, 0);
});
