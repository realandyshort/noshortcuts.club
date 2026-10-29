/* Local preview with live reload and the tinker panel.   npm run dev   then open http://localhost:4000

   Serves the site/ folder the way the published site is laid out:
     /config/site.config.json  -> config/site.config.json
     /data/<file>              -> site/data/<file> (robot output) or seed/<file>
     /archive/days/NNN.json    -> archive/days/NNN.json
     /                         -> home.html on or after day 1, coming-soon.html before it (?day= forces home)
   Edits to site/, config/ or seed/ reload the browser. ?tinker=1 opens the tinker panel, whose Save
   button writes config/site.config.json through POST /__tinker/save. None of this exists in production. */
const fs = require("fs");
const http = require("http");
const path = require("path");
const C = require("./lib/common");

const PORT = Number(process.argv[2] || process.env.PORT || 4000);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".ttf": "font/ttf", ".m4a": "audio/mp4", ".mp3": "audio/mpeg" };

const clients = new Set();
const RELOAD = `<script>(function(){try{var s=new EventSource("/__dev/events");s.onmessage=function(e){if(e.data==="reload")location.reload()};}catch(e){}})()</script>`;

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/\/+$/, "") || "/";
  if (clean === "/config/site.config.json") return C.P.config;
  if (clean.startsWith("/data/")) {
    const name = clean.slice(6);
    const gen = path.join(C.P.data, name), seed = path.join(C.P.seed, name);
    return fs.existsSync(gen) ? gen : seed;
  }
  if (clean.startsWith("/archive/")) return path.join(C.P.root, clean);
  if (clean === "/" || clean === "/index.html") {
    const page = require("./which-index").decide().page;
    return path.join(C.P.site, page === "home" ? "home.html" : "coming-soon.html");
  }
  let file = path.join(C.P.site, clean);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  else if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  return file;
}

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/__dev/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("data: hello\n\n");
    clients.add(res); req.on("close", () => clients.delete(res));
    return;
  }
  if (url.pathname === "/__tinker/ping") return send(res, 200, JSON.stringify({ ok: true }), MIME[".json"]);
  if (url.pathname === "/__tinker/save" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(C.P.config, JSON.stringify(parsed, null, 2) + "\n");
        send(res, 200, JSON.stringify({ ok: true }), MIME[".json"]);
      } catch (e) { send(res, 400, JSON.stringify({ ok: false, error: e.message }), MIME[".json"]); }
    });
    return;
  }
  // The home page before day 1: "/" is coming-soon, but "/?day=306" should preview the home page
  if ((url.pathname === "/" || url.pathname === "/index.html") && url.searchParams.has("day")) {
    return serve(path.join(C.P.site, "home.html"), res);
  }
  serve(resolve(url.pathname), res);
});

function serve(file, res) {
  if (!file.startsWith(C.P.root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found: " + path.relative(C.P.root, file));
  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  if (ext === ".html") body = Buffer.from(body.toString("utf8").replace(/<\/body>/i, RELOAD + "</body>"));
  send(res, 200, body, MIME[ext] || "application/octet-stream");
}

// Live reload: watch the folders Andy edits
let timer = null;
function changed() { clearTimeout(timer); timer = setTimeout(() => { for (const c of clients) c.write("data: reload\n\n"); }, 150); }
[C.P.site, path.dirname(C.P.config), C.P.seed].forEach(dir => {
  try { fs.watch(dir, { recursive: true }, changed); } catch (e) { /* older platforms: no recursive watch */ }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`No Shortcuts preview: http://localhost:${PORT}   (Ctrl+C to stop)`);
  console.log(`Tinker panel:         http://localhost:${PORT}/?day=306&tinker=1`);
  console.log(`Test mode page:       http://localhost:${PORT}/test/`);
});
