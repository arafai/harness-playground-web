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
  api = createServer((req, res) => {
    const text = new URL(req.url, "http://localhost").searchParams.get("text");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ slug: `slug:${text}` }));
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
