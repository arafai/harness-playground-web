import { createServer } from "node:http";

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Slug preview</title>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style></head>
<body>
  <h1>Slug preview</h1>
  <form id="preview">
    <label for="text">Title</label>
    <input id="text" name="text" autocomplete="off">
    <button type="submit">Preview</button>
  </form>
  <p>Slug: <output id="slug"></output></p>
  <h2>Save item</h2>
  <form id="save">
    <label for="title">Title</label>
    <input id="title" name="title" autocomplete="off" data-testid="eac-2-title-input">
    <button type="submit" id="save-button" data-testid="eac-2-save-button">Save</button>
  </form>
  <p id="save-error" role="alert" hidden></p>
  <p id="save-status" role="status" aria-live="polite" class="sr-only"></p>
  <h2>Saved items</h2>
  <p id="list-state">Loading…</p>
  <button type="button" id="retry" hidden>Retry</button>
  <ol id="saved-list" data-testid="eac-2-saved-list" hidden></ol>
  <script>
    document.getElementById("preview").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = document.getElementById("text").value;
      const res = await fetch("/api/slug?text=" + encodeURIComponent(text));
      document.getElementById("slug").textContent = (await res.json()).slug;
    });

    const list = document.getElementById("saved-list");
    const state = document.getElementById("list-state");
    const retry = document.getElementById("retry");
    const titleInput = document.getElementById("title");
    const saveButton = document.getElementById("save-button");
    const errorBox = document.getElementById("save-error");

    function addItem(item) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "/items/" + encodeURIComponent(item.slug);
      a.textContent = item.title;
      a.dataset.testid = "eac-2-item-link";
      const slug = document.createElement("code");
      slug.textContent = item.slug;
      slug.dataset.testid = "eac-2-item-slug";
      li.append(a, " ", slug);
      list.append(li);
      list.hidden = false;
      state.hidden = true;
    }

    async function load() {
      state.hidden = false;
      state.textContent = "Loading…";
      retry.hidden = true;
      list.hidden = true;
      list.replaceChildren();
      try {
        const res = await fetch("/api/items");
        if (!res.ok) throw new Error("bad status");
        const { items } = await res.json();
        if (items.length === 0) state.textContent = "No saved items yet";
        else items.forEach(addItem);
      } catch {
        state.textContent = "Could not load saved items";
        retry.hidden = false;
      }
    }
    retry.addEventListener("click", load);

    document.getElementById("save").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saveButton.disabled) return;
      saveButton.disabled = true;
      errorBox.hidden = true;
      errorBox.textContent = "";
      try {
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: titleInput.value }),
        });
        let data = {};
        try { data = await res.json(); } catch {}
        if (!res.ok) throw new Error(data.error || "Could not save item");
        addItem(data);
        titleInput.value = "";
        document.getElementById("save-status").textContent = "Saved " + data.title + " as " + data.slug;
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      } finally {
        saveButton.disabled = false;
        titleInput.focus();
      }
    });
    load();
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
