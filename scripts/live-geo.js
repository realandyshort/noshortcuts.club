/* Geography from the real rides (robot step). For each day with recorded rides that has not been
   looked at yet, fetch the GPS track from Intervals.icu and work out which national parks the track
   enters (seed/national_parks.json) and the highest altitude. Writes site/data/geo_live.json.
   Days already done are kept; a failed lookup is retried next hour and never wipes earlier results. */
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

// Ray casting: is [lat, lon] inside the ring of [lon, lat] points?
function inside(lat, lon, ring) {
  let ok = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
function bbox(ring) { let a = [Infinity, Infinity, -Infinity, -Infinity]; ring.forEach(p => { a = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; }); return a; }

function parksEntered(points, parks) {
  const hits = {};
  parks.forEach(pk => {
    for (const ring of pk.rings) {
      const b = pk._bb || (pk._bb = pk.rings.map(bbox));
      const bb = b[pk.rings.indexOf(ring)];
      for (const p of points) {
        if (p[1] < bb[0] || p[1] > bb[2] || p[0] < bb[1] || p[0] > bb[3]) continue;
        if (inside(p[0], p[1], ring)) { hits[pk.name] = true; return; }
      }
    }
  });
  return Object.keys(hits);
}

async function run(ctx) {
  const key = C.env("INTERVALS_API_KEY");
  const rides = C.readData("rides.json", { days: {} });
  if (!key || !rides.days) return;
  const plan = ctx.plan || C.readData("plan.json");
  const parks = C.readJSON(path.join(C.P.seed, "national_parks.json"), { parks: [] }).parks;
  const out = C.readData("geo_live.json", { days: {} });
  const auth = "Basic " + Buffer.from(`API_KEY:${key}`).toString("base64");
  let looked = 0;
  for (const d of plan.days) {
    const r = rides.days[d.date];
    if (!r || !r.ids || !r.ids.length) continue;
    const have = out.days[d.day];
    if (have && have.ids && have.ids.join() === r.ids.join()) continue;      // nothing new that day
    if (looked >= 12) break;                                                  // a dozen days per hour is plenty
    looked++;
    try {
      let points = [], maxAlt = null;
      for (const id of r.ids) {
        const streams = await C.fetchJSON(`https://intervals.icu/api/v1/activity/${encodeURIComponent(id)}/streams?types=latlng,altitude`, { headers: { Authorization: auth }, timeoutMs: 60000 });
        const ll = (streams.find(s => s.type === "latlng") || {}).data || [];
        const alt = (streams.find(s => s.type === "altitude") || {}).data || [];
        for (let i = 0; i < ll.length; i += 5) if (ll[i]) points.push([ll[i][0], ll[i][1]]);
        alt.forEach(a => { if (a != null && (maxAlt === null || a > maxAlt)) maxAlt = a; });
      }
      out.days[d.day] = { ids: r.ids, parks: parksEntered(points, parks), max_alt_m: maxAlt === null ? null : Math.round(maxAlt), points: points.length, done_at: new Date().toISOString() };
      C.log(`live geo: day ${d.day}: ${out.days[d.day].parks.length} park(s), max ${out.days[d.day].max_alt_m} m`);
    } catch (e) { C.log(`live geo: day ${d.day} failed: ${e.message.slice(0, 100)} (will retry)`); }
  }
  out.generated_at = new Date().toISOString();
  C.writeData("geo_live.json", out);
}
module.exports = { run, inside, parksEntered };
if (require.main === module) run({}).catch(e => { console.error(e); process.exit(1); });
