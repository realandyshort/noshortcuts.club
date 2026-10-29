/* Shared helpers for the robot scripts. Plain Node, no packages.
   Everything here is small and boring on purpose: read/write JSON, fetch with a timeout,
   parse CSV and simple XML, and keep the per-source status that the pages read. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const P = {
  root: ROOT,
  config: path.join(ROOT, "config", "site.config.json"),
  seed: path.join(ROOT, "seed"),
  site: path.join(ROOT, "site"),
  data: path.join(ROOT, "site", "data"),
  archive: path.join(ROOT, "archive", "days"),
  stories: path.join(ROOT, "site", "stories"),
  fonts: path.join(ROOT, "assets", "fonts")
};

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
function dataFile(name) { return path.join(P.data, name); }
function readData(name, fallback) { return readJSON(dataFile(name), fallback); }
function writeData(name, value) { writeJSON(dataFile(name), value); }
function loadConfig() { return readJSON(P.config); }

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// fetch with a timeout and a polite user agent. Throws on non-2xx.
async function fetchText(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), options.timeoutMs || 30000);
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: Object.assign({ "User-Agent": "noshortcuts.club site robot (hello@noshortcuts.club)" }, options.headers || {}),
      body: options.body,
      signal: ctrl.signal,
      redirect: "follow"
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.split("?")[0]}: ${text.slice(0, 200)}`);
    return text;
  } finally { clearTimeout(t); }
}
async function fetchJSON(url, options) { return JSON.parse(await fetchText(url, options)); }

// CSV parser that copes with quoted commas and newlines (what Google Sheets exports).
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

// Minimal XML helpers for RSS/Atom/KML. Good enough for well-formed feeds.
const xml = {
  blocks(text, tag) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
    const out = []; let m;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  },
  tag(block, tag) {
    const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
    return m ? xml.clean(m[1]) : "";
  },
  attr(block, tag, attr) {
    const m = block.match(new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`));
    return m ? xml.decode(m[1]) : "";
  },
  clean(s) {
    const cd = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
    return xml.decode(cd ? cd[1] : s).trim();
  },
  decode(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, "&");
  },
  stripHTML(s) { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
};

/* Source status. The pages read site/data/status.json and hide a source's sections while it is
   broken. States: ok, failing (one bad run), broken (2+ bad runs), not_connected (secrets missing),
   skipped (turned off in config). */
const STATUS_FILE = "status.json";
function loadStatus() { return readData(STATUS_FILE, { generated_at: null, sources: {} }); }
function saveStatus(status) { status.generated_at = new Date().toISOString(); writeData(STATUS_FILE, status); }
function sourceEntry(status, name) {
  return status.sources[name] = Object.assign({
    state: "ok", last_success_at: null, last_new_item_at: null, consecutive_failures: 0,
    last_error: null, last_attempt_at: null
  }, status.sources[name] || {});
}
function recordSuccess(status, name, info = {}) {
  const s = sourceEntry(status, name);
  const now = new Date().toISOString();
  s.state = "ok"; s.consecutive_failures = 0; s.last_error = null;
  s.last_attempt_at = now; s.last_success_at = now;
  if (info.newestItemAt && info.newestItemAt !== s.last_new_item_at) s.last_new_item_at = info.newestItemAt;
  if (info.note !== undefined) s.note = info.note;
  return s;
}
function recordFailure(status, name, err, brokenAfter) {
  const s = sourceEntry(status, name);
  s.last_attempt_at = new Date().toISOString();
  s.consecutive_failures = (s.consecutive_failures || 0) + 1;
  s.last_error = String(err && err.message || err).slice(0, 500);
  s.state = s.consecutive_failures >= (brokenAfter || 2) ? "broken" : "failing";
  return s;
}
function recordNotConnected(status, name, note) {
  const s = sourceEntry(status, name);
  s.state = "not_connected"; s.consecutive_failures = 0; s.last_error = null;
  s.last_attempt_at = new Date().toISOString(); s.note = note || "Secrets not set yet";
  return s;
}
function recordSkipped(status, name, note) {
  const s = sourceEntry(status, name);
  s.state = "skipped"; s.last_attempt_at = new Date().toISOString(); s.note = note || "Turned off in config";
  return s;
}

function env(name) { const v = process.env[name]; return v && v.trim() ? v.trim() : ""; }
function hasFlag(flag) { return process.argv.includes(flag); }

module.exports = {
  P, readJSON, writeJSON, readData, writeData, dataFile, loadConfig, log,
  fetchText, fetchJSON, parseCSV, xml,
  loadStatus, saveStatus, recordSuccess, recordFailure, recordNotConnected, recordSkipped, sourceEntry,
  env, hasFlag
};
