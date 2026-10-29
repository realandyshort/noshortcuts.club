/* Instagram stories for new dispatches. For each dispatch not seen before: make a 1080x1920 image
   (black, the route line with the ridden part in persimmon, "NEW DISPATCH", "Day N: Place", the mark,
   noshortcuts.club; no dates), save it under site/stories/ so it gets a public address, and once
   that address is live, publish it as a story. Never posts the same dispatch twice.

   Posting only happens when Instagram is connected and stories.dryRun is false, and only for a
   dispatch that was new while live, so nothing old gets posted when the switch is flipped later.
   Flags: --dry-run forces no posting.  --force-image regenerates images. */
const fs = require("fs");
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");
const RouteLine = require("../site/js/route-line.js");

const INK = "#161412", CREAM = "#FBE9D7", PERSIMMON = "#E8593D", GRAY = "#8C8681";

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "dispatch"; }

// Wrap text into lines of roughly maxChars (Petrona at this size holds ~18 characters per line).
function wrap(text, maxChars) {
  const words = String(text).split(/\s+/), lines = []; let cur = "";
  words.forEach(w => { if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function storySVG({ points, fraction, dayLabel, place, label, site }) {
  const W = 1080, H = 1920;
  const map = RouteLine.projector(points);
  const all = points.map(map), b = RouteLine.bounds(all);
  const halves = Trip.splitAtFraction(points, Math.max(0, Math.min(1, fraction)));
  const done = halves[0].map(map), rest = halves[1].map(map);
  // Fit the 1000-unit-wide drawing to the image width, placed in the middle band
  const scale = W / RouteLine.VIEW_WIDTH, lineH = b.height * scale;
  const lineTop = 760 - lineH / 2;
  const tf = `translate(0 ${lineTop}) scale(${scale}) translate(0 ${-b.top})`;
  const strokeW = 7 / scale;
  const placeLines = wrap(place, 16);
  const titleY = 1180;
  const placeText = placeLines.map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 1.05}em">${esc(l)}</tspan>`).join("");
  const markY = titleY + 110 * (placeLines.length + 1) + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <g transform="${tf}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeW}">
    <path d="${RouteLine.pathData(rest, { tailEnd: true })}" stroke="${GRAY}"/>
    <path d="${RouteLine.pathData(done, { tailStart: true })}" stroke="${PERSIMMON}"/>
  </g>
  <text x="80" y="1080" font-family="JetBrains Mono" font-size="40" letter-spacing="6" fill="${PERSIMMON}">${esc(label)}</text>
  <text x="80" y="${titleY}" font-family="Petrona" font-weight="600" font-size="104" fill="${CREAM}">${esc(dayLabel)}</text>
  <text x="80" y="${titleY + 112}" font-family="Petrona" font-style="italic" font-weight="600" font-size="104" fill="${PERSIMMON}">${placeText}</text>
  <g transform="translate(80 ${markY}) scale(2.2)" fill="none" stroke="${PERSIMMON}" stroke-width="3.2" stroke-linecap="round">
    <path d="M20.5 4.2 C20.1 11 19.8 27 19.6 35.6"/><path d="M6.8 11.6 C13 15.4 26 23.5 33.4 28.1"/><path d="M33.9 11 C27.5 15.8 13.4 24.6 6.2 28.9"/>
  </g>
  <text x="80" y="1800" font-family="JetBrains Mono" font-size="40" letter-spacing="4" fill="${CREAM}">${esc(site)}</text>
</svg>`;
}

function renderPNG(svg) {
  const { Resvg } = require("@resvg/resvg-js");
  const fontFiles = fs.readdirSync(C.P.fonts).filter(f => f.endsWith(".ttf")).map(f => path.join(C.P.fonts, f));
  const r = new Resvg(svg, { fitTo: { mode: "width", value: 1080 }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Petrona" } });
  return r.render().asPng();
}

async function publish(imageUrl, config) {
  const token = C.env("IG_ACCESS_TOKEN"), userId = C.env("IG_USER_ID");
  const host = (config.sources.instagramApiHost || "graph.instagram.com").replace(/^https?:\/\//, "");
  const base = `https://${host}/v21.0/${encodeURIComponent(userId)}`;
  const made = await C.fetchJSON(`${base}/media?media_type=STORIES&image_url=${encodeURIComponent(imageUrl)}&access_token=${encodeURIComponent(token)}`, { method: "POST" });
  const done = await C.fetchJSON(`${base}/media_publish?creation_id=${encodeURIComponent(made.id)}&access_token=${encodeURIComponent(token)}`, { method: "POST" });
  return done.id;
}

async function run(ctx) {
  const config = ctx.config, stories = config.stories || {};
  if (stories.enabled === false) { C.log("stories: turned off in config"); return; }
  const plan = ctx.plan || C.readData("plan.json", null);
  if (!plan) return;
  const dispatches = C.readData("dispatches.json", { items: [] }).items || [];
  const route = C.readJSON(path.join(C.P.seed, "route_line.json")).points;
  const state = C.readData("stories.json", { entries: {} });
  const igState = ((ctx.status || {}).sources || {}).instagram || {};
  const connected = igState.state === "ok";
  const dryRun = stories.dryRun !== false || C.hasFlag("--dry-run");
  const siteUrl = `https://${config.site.domain}`;
  const now = Date.now();
  let changed = false;

  for (const item of dispatches) {
    const key = item.id;
    let e = state.entries[key];
    if (!e || C.hasFlag("--force-image")) {
      const dayN = Trip.dayOfTimestamp(plan, item.published_at, ctx.offset || 0);
      const onTrip = dayN >= 1 && dayN <= plan.days.length;
      const d = onTrip ? plan.days[dayN - 1] : null;
      const dayLabel = onTrip ? `Day ${dayN}:` : "Before the ride:";
      const place = onTrip ? (d.kind === "rest" || d.from === d.to ? d.to : d.to) : item.title.replace(/^no shortcuts\s*[—-]\s*/i, "");
      const fraction = onTrip ? Trip.fractionAtDay(plan, dayN) : 0;
      const file = `${onTrip ? "day-" + String(dayN).padStart(3, "0") : "pre"}-${slug(item.title)}.png`;
      const svg = storySVG({ points: route, fraction, dayLabel, place, label: stories.label || "NEW DISPATCH", site: config.site.domain });
      fs.mkdirSync(C.P.stories, { recursive: true });
      fs.writeFileSync(path.join(C.P.stories, file), renderPNG(svg));
      e = state.entries[key] = Object.assign({ first_seen_at: new Date(now).toISOString(), posted_at: null, mode: null }, e || {}, { image: `stories/${file}`, title: item.title, day: onTrip ? dayN : null });
      C.log(`stories: made ${file}`);
      changed = true;
    }
    if (e.posted_at) continue;
    const freshMs = (stories.postWithinHours || 48) * 3600000;
    const fresh = now - Date.parse(e.first_seen_at) <= freshMs;
    if (!connected) { if (!e.mode) { e.mode = "seen while not connected"; changed = true; } continue; }
    if (dryRun) { if (e.mode !== "dry-run") { e.mode = "dry-run"; changed = true; } continue; }
    if (!fresh) { if (e.mode !== "too old to post") { e.mode = "too old to post"; changed = true; } continue; }
    // Live: the image must be public first (it is deployed after this run commits), so check.
    const url = `${siteUrl}/${e.image}`;
    try { await C.fetchText(url, { method: "HEAD", timeoutMs: 15000 }); }
    catch (err) { C.log(`stories: ${url} not live yet, will post next run`); continue; }
    try {
      const id = await publish(url, config);
      e.posted_at = new Date().toISOString(); e.mode = "posted"; e.ig_media_id = id; changed = true;
      C.log(`stories: posted ${e.image}`);
    } catch (err) { e.last_error = err.message.slice(0, 300); changed = true; C.log(`stories: post failed: ${err.message}`); }
  }
  if (changed || !fs.existsSync(C.dataFile("stories.json"))) C.writeData("stories.json", state);
}

module.exports = { run, storySVG };
if (require.main === module) run({ config: C.loadConfig(), status: C.loadStatus(), offset: (C.readData("meta.json", {}).utc_offset_seconds || 0) }).catch(e => { console.error(e); process.exit(1); });
