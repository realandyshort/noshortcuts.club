/* One-time (rerun when the plan's Komoot links change): the real planned track for every day that
   has a Komoot tour link in the route plan, from Komoot's public tour data. Writes
   seed/day_tracks.json (thinned to about one point every 0.3 miles) and refreshes the start and end
   coordinates in seed/day_points.json. Days without a link keep their looked-up or route points.
       node scripts/komoot-routes.js         (a few minutes; one request per tour) */
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh) noshortcuts.club site robot (hello@noshortcuts.club)" };

function thin(points, stepMi) {
  const out = [points[0]]; let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += Trip.haversineMi(points[i - 1], points[i]);
    if (acc >= stepMi || i === points.length - 1) { out.push(points[i]); acc = 0; }
  }
  return out;
}

async function main() {
  const plan = C.readData("plan.json");
  const file = path.join(C.P.seed, "day_tracks.json");
  const out = C.readJSON(file, { note: "", days: {} });
  out.note = "Planned track for each day with a Komoot tour link, from Komoot's public tour data, thinned to about one point per 0.3 miles. [lat, lon, altitude_m] triples. Used for the geography-based secret stats; not shipped to the site.";
  const pointsFile = path.join(C.P.seed, "day_points.json");
  const pts = C.readJSON(pointsFile, { note: "", days: {} });
  let fetched = 0, missing = 0;
  for (const d of plan.days) {
    const m = /komoot\.com\/tour\/(\d+)/.exec(d.route_url || "");
    if (!m) { missing++; continue; }
    if (out.days[d.day] && out.days[d.day].tour === m[1] && out.days[d.day].max_alt_m !== undefined) continue;
    try {
      const j = await C.fetchJSON(`https://api.komoot.de/v007/tours/${m[1]}/coordinates`, { headers: UA, timeoutMs: 30000 });
      const raw = (j.items || []).map(p => [p.lat, p.lng, Math.round(p.alt || 0)]);
      if (raw.length < 2) throw new Error("no coordinates");
      const t = thin(raw, 0.3).map(p => [+p[0].toFixed(5), +p[1].toFixed(5), p[2]]);
      const maxAlt = raw.reduce((m, p) => Math.max(m, p[2]), -1e9);
      out.days[d.day] = { tour: m[1], points: t, start: t[0], end: t[t.length - 1], raw_points: raw.length, max_alt_m: maxAlt };
      const e = pts.days[d.day] || {};
      e.start = { lat: t[0][0], lon: t[0][1], place: d.from, source: "komoot" };
      e.end = { lat: t[t.length - 1][0], lon: t[t.length - 1][1], place: d.to, source: "komoot" };
      pts.days[d.day] = e;
      fetched++;
      if (fetched % 25 === 0) { C.writeJSON(file, out); C.writeJSON(pointsFile, pts); C.log(`komoot: ${fetched} tours so far (day ${d.day})`); }
    } catch (err) { C.log(`komoot: day ${d.day} tour ${m[1]}: ${err.message.slice(0, 80)}`); }
    await sleep(350);
  }
  // Rest days: the rider stays where the previous day ended
  plan.days.forEach(d => {
    if (out.days[d.day]) return;
    const prev = pts.days[d.day - 1];
    if (d.kind === "rest" && prev && prev.end && pts.days[d.day]) { pts.days[d.day].start = Object.assign({}, prev.end, { place: d.from }); pts.days[d.day].end = Object.assign({}, prev.end, { place: d.to }); }
  });
  C.writeJSON(file, out); C.writeJSON(pointsFile, pts);
  C.log(`done: ${Object.keys(out.days).length} day tracks (${missing} days have no Komoot link, mostly rest days and Segment 6)`);
}
main().catch(e => { console.error(e); process.exit(1); });
