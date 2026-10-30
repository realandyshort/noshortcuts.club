/* One-time: coordinates for every place in the plan (each day's start and end), from
   OpenStreetMap's Nominatim, one request per second as their rules ask. A result only counts if it
   lies within 80 miles of where the stylized route line puts that day; otherwise the route point
   is used. Writes seed/day_points.json. Rerun only if the plan's places change:
       node scripts/geo-places.js            (about 10 minutes) */
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Towns, villages, campgrounds and the like, never a province or state of the same name
const PLACE_TYPES = /^(city|town|village|hamlet|municipality|locality|suburb|neighbourhood|isolated_dwelling|camp_site|tourism|natural|amenity|leisure|place)$/;
async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  try {
    const j = await C.fetchJSON(url, { timeoutMs: 20000 });
    const pick = j.find(r => PLACE_TYPES.test(r.addresstype || "") || PLACE_TYPES.test(r.category || "") || PLACE_TYPES.test(r.type || ""));
    return pick ? { lat: +pick.lat, lon: +pick.lon, name: pick.display_name } : null;
  } catch (e) { return null; }
}

async function main() {
  const plan = C.readData("plan.json");
  const route = C.readJSON(path.join(C.P.seed, "route_line.json")).points;
  const countries = C.readJSON(path.join(C.P.seed, "countries.json"));
  const out = C.readJSON(path.join(C.P.seed, "day_points.json"), { note: "", days: {} });
  out.note = "Coordinates for each day's start and end place: geocoded with OpenStreetMap Nominatim when the result lies near the route, otherwise the point on the stylized route line. Used for the geography-based secret stats.";
  const cache = {};
  const countryOf = day => { let c = countries[0].country; countries.forEach(x => { if (x.first_day <= day) c = x.country; }); return c; };
  const skip = /^(free camp|wild camp|camp|bush camp|roadside|tbd|\?)$/i;

  for (const d of plan.days) {
    const prior = out.days[d.day];
    const settled = prior && prior.end && ["osm", "komoot"].includes(prior.end.source) && prior.start && ["osm", "komoot"].includes(prior.start.source);
    if (settled && !process.argv.includes("--redo")) continue;    // already placed well
    const routePt = Trip.pointAtFraction(route, Trip.fractionAtDay(plan, d.day));
    const startPt = Trip.pointAtFraction(route, Trip.fractionAtDay(plan, d.day - 1));
    const entry = {};
    for (const [key, place, near] of [["start", d.from, startPt], ["end", d.to, routePt]]) {
      const q = `${place}, ${countryOf(d.day)}`;
      let hit = null;
      if (place && !skip.test(place.trim())) {
        if (cache[q] === undefined) { cache[q] = await geocode(q); await sleep(1100); }
        hit = cache[q];
      }
      const prev = prior && prior[key];
      if (prev && prev.source === "komoot") { entry[key] = prev; continue; }                       // a real track beats any lookup
      if (hit && Trip.haversineMi([hit.lat, hit.lon], near) <= 120) entry[key] = { lat: +hit.lat.toFixed(4), lon: +hit.lon.toFixed(4), place, source: "osm" };
      else if (key === "start" && out.days[d.day - 1] && out.days[d.day - 1].end) entry[key] = Object.assign({}, out.days[d.day - 1].end, { place });   // where yesterday ended
      else if (key === "end" && (d.kind === "rest" || !place) && out.days[d.day - 1] && out.days[d.day - 1].end) entry[key] = Object.assign({}, out.days[d.day - 1].end, { place: place || d.from });
      else entry[key] = { lat: +near[0].toFixed(4), lon: +near[1].toFixed(4), place, source: "route" };
    }
    out.days[d.day] = entry;
    if (d.day % 10 === 0) { C.writeJSON(path.join(C.P.seed, "day_points.json"), out); C.log(`places: day ${d.day}/${plan.days.length}`); }
  }
  C.writeJSON(path.join(C.P.seed, "day_points.json"), out);
  const geocoded = Object.values(out.days).filter(e => e.end.source === "osm").length;
  C.log(`done: ${geocoded} of ${plan.days.length} end places found on OpenStreetMap`);
}
main().catch(e => { console.error(e); process.exit(1); });
