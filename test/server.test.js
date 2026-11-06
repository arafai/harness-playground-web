import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createWeb } from "../src/server.js";

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, () => resolve(`http://127.0.0.1:${server.address().port}`)),
  );

let api;
let web;
let base;

before(async () => {
  // A stand-in for the api platform.
  const items = [];
  const send = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  api = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/slug") {
      return send(res, 200, { slug: `slug:${url.searchParams.get("text")}` });
    }
    if (url.pathname === "/items" && req.method === "GET") return send(res, 200, { items });
    if (url.pathname === "/items" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let title;
      try {
        title = JSON.parse(raw).title;
      } catch {}
      if (typeof title !== "string" || !title.trim()) {
        return send(res, 400, { error: "title is required" });
      }
      const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      let slug = stem;
      for (let n = 2; items.some((i) => i.slug === slug); n++) slug = `${stem}-${n}`;
      const item = { id: items.length + 1, title, slug };
      items.push(item);
      return send(res, 201, item);
    }
    const match = /^\/items\/(.+)$/.exec(url.pathname);
    if (match && req.method === "GET") {
      const item = items.find((i) => i.slug === decodeURIComponent(match[1]));
      return item ? send(res, 200, item) : send(res, 404, { error: "not found" });
    }
    return send(res, 404, { error: "not found" });
  });
  web = createWeb({ apiUrl: await listen(api) });
  base = await listen(web);
});
after(() => {
  web.close();
  api.close();
});

test("answers its health check", async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test("serves the preview page", async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<h1>Slug preview<\/h1>/);
});

test("proxies slug previews to the api", async () => {
  const res = await fetch(`${base}/api/slug?text=Hello`);
  assert.deepEqual(await res.json(), { slug: "slug:Hello" });
});

test("reports an unreachable api as 502", async () => {
  const lonely = createWeb({ apiUrl: "http://127.0.0.1:9" });
  const lonelyBase = await listen(lonely);
  assert.equal((await fetch(`${lonelyBase}/api/slug?text=x`)).status, 502);
  lonely.close();
});

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("proxies POST /api/items with body and status", async () => {
  const res = await post("/api/items", { title: "Hello,  World!" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: 1, title: "Hello,  World!", slug: "hello-world" });
  const bad = await post("/api/items", { title: " " });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "title is required" });
});

test("proxies the item list", async () => {
  await post("/api/items", { title: "Hello,  World!" });
  const res = await fetch(`${base}/api/items`);
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.deepEqual(items.map((i) => i.slug), ["hello-world", "hello-world-2"]);
});

test("proxies an item by slug and forwards 404", async () => {
  const ok = await fetch(`${base}/api/items/hello-world-2`);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).title, "Hello,  World!");
  const missing = await fetch(`${base}/api/items/nope`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "not found" });
});

test("URL-encodes the slug upstream", async () => {
  let seen;
  const spy = createServer((req, res) => {
    seen = req.url;
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  const spyWeb = createWeb({ apiUrl: await listen(spy) });
  const spyBase = await listen(spyWeb);
  await fetch(`${spyBase}/api/items/a%3Fb%23c%2Fd`);
  assert.equal(seen, "/items/a%3Fb%23c%2Fd");
  spyWeb.close();
  spy.close();
});

test("reports an unreachable api as 502 on every proxy route", async () => {
  const lonely = createWeb({ apiUrl: "http://127.0.0.1:9" });
  const lonelyBase = await listen(lonely);
  for (const [method, path] of [
    ["GET", "/api/items"],
    ["POST", "/api/items"],
    ["GET", "/api/items/x"],
  ]) {
    const res = await fetch(`${lonelyBase}${path}`, {
      method,
      ...(method === "POST" ? { body: JSON.stringify({ title: "x" }) } : {}),
    });
    assert.equal(res.status, 502, `${method} ${path}`);
    assert.ok((await res.json()).error);
  }
  lonely.close();
});

test("serves the save form and saved list on the home page", async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<h1>Slug preview<\/h1>/);
  assert.ok(html.indexOf('id="preview"') < html.indexOf('id="save"'));
  for (const id of [
    "eac-2-title-input",
    "eac-2-save-button",
    "eac-2-saved-list",
    "eac-2-item-link",
    "eac-2-item-slug",
  ]) {
    assert.ok(html.includes(id), id);
  }
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<ol id="saved-list"/);
  for (const text of ["Loading…", "No saved items yet", "Could not load saved items", "Retry"]) {
    assert.ok(html.includes(text), text);
  }
  assert.ok(html.includes("textContent"));
  assert.ok(!html.includes("innerHTML"));
});

test("save flow through the proxy yields slug and link target", async () => {
  const res = await post("/api/items", { title: "<b>Hi</b>,  There!" });
  const item = await res.json();
  assert.equal(item.slug, "b-hi-b-there");
  assert.equal(item.title, "<b>Hi</b>,  There!");
  const { items } = await (await fetch(`${base}/api/items`)).json();
  assert.equal(items.at(-1).slug, "b-hi-b-there");
  assert.equal((await fetch(`${base}/api/items/${encodeURIComponent(item.slug)}`)).status, 200);
});
