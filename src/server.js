import { createServer } from "node:http";

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Slug preview</title></head>
<body>
  <h1>Slug preview</h1>
  <form id="preview">
    <label for="text">Title</label>
    <input id="text" name="text" autocomplete="off">
    <button type="submit">Preview</button>
  </form>
  <p>Slug: <output id="slug"></output></p>
  <script>
    document.getElementById("preview").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = document.getElementById("text").value;
      const res = await fetch("/api/slug?text=" + encodeURIComponent(text));
      document.getElementById("slug").textContent = (await res.json()).slug;
    });
  </script>
</body>
</html>`;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * The playground web app: one page, and a server-side proxy to the api platform, so the
 * browser never needs to reach the API itself.
 */
export function createWeb({ apiUrl }) {
  // Forwards one request to the api; status and body pass through verbatim.
  async function proxy(res, path, { method = "GET", body } = {}) {
    try {
      const init = { method };
      if (body !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = body;
      }
      const upstream = await fetch(`${apiUrl}${path}`, init);
      res.writeHead(upstream.status, { "content-type": "application/json" });
      return res.end(await upstream.text());
    } catch {
      res.writeHead(502, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "the api is unreachable" }));
    }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(PAGE);
    }
    if (req.method === "GET" && url.pathname === "/api/slug") {
      return proxy(res, `/slug?${url.searchParams}`);
    }
    if (url.pathname === "/api/items" && req.method === "GET") {
      return proxy(res, "/items");
    }
    if (url.pathname === "/api/items" && req.method === "POST") {
      return proxy(res, "/items", { method: "POST", body: await readBody(req) });
    }
    const itemMatch = /^\/api\/items\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && itemMatch) {
      let slug = itemMatch[1];
      try {
        slug = decodeURIComponent(slug);
      } catch {}
      return proxy(res, `/items/${encodeURIComponent(slug)}`);
    }
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "not found" }));
  });
}
