/* Position: Garmin MapShare KML feed. Only positions at least 24 hours old are ever published
   (config trip.positionDelayHours). Adds a place name from OpenStreetMap's reverse geocoder, with
   the plan's place for that stretch of route as the fallback. */
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

function parsePlacemarks(kml) {
  return C.xml.blocks(kml, "Placemark").map(pm => {
    const when = C.xml.tag(pm, "when") || C.xml.tag(pm, "Data name=\"Time UTC\"");
    const coords = C.xml.tag(pm, "coordinates").split(",").map(Number);
    const t = Date.parse(when);
    if (isNaN(t) || coords.length < 2 || !isFinite(coords[0]) || !isFinite(coords[1])) return null;
    return { at: new Date(t).toISOString(), lon: coords[0], lat: coords[1], alt_m: coords[2] || 0 };
  }).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
}

async function placeName(lat, lon) {
  try {
    const j = await C.fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=en`, { timeoutMs: 15000 });
    const a = j.address || {};
    const town = a.city || a.town || a.village || a.municipality || a.county || a.state || "";
    return { place: town, country: a.country || "" };
  } catch (e) { return null; }
}

async function run(ctx) {
  const trip = ctx.config.trip || {};
  const delayMs = (trip.positionDelayHours || 24) * 3600000;
  const id = ctx.config.sources.garminShareId;
  const previous = C.readData("position.json", { available: false });
  // Ask for the last few days so the delayed point is in the window.
  const since = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 16) + "Z";
  const kml = await C.fetchText(`https://share.garmin.com/Feed/Share/${encodeURIComponent(id)}?d1=${encodeURIComponent(since)}`);
  const points = parsePlacemarks(kml);
  const cutoff = Date.now() - delayMs;
  const usable = points.find(p => Date.parse(p.at) <= cutoff);

  if (!usable) {
    // Nothing old enough yet: keep what we had (still delayed), or say there is nothing.
    const keep = previous.available ? previous : { available: false, note: points.length ? "newest point is still inside the privacy delay" : "no points in the feed yet" };
    keep.fetched_at = new Date().toISOString();
    C.writeData("position.json", keep);
    C.log(`position: ${points.length} point(s), none old enough; ${keep.available ? "kept previous" : "none"}`);
    return { newestItemAt: points[0] ? points[0].at : previous.at || null, note: keep.note };
  }

  const pos = { available: true, fetched_at: new Date().toISOString(), lat: usable.lat, lon: usable.lon, at: usable.at, alt_m: usable.alt_m };
  const plan = C.readData("plan.json", null);
  const route = C.readJSON(require("path").join(C.P.seed, "route_line.json"));
  const near = Trip.fractionNearest(route.points, [pos.lat, pos.lon]);
  pos.route_fraction = near.fraction;
  pos.off_route_mi = Math.round(near.distanceMi * 10) / 10;
  if (plan) pos.plan_day_at_position = Trip.dayAtFraction(plan, near.fraction);

  const samePlace = previous.available && Math.abs(previous.lat - pos.lat) < 0.02 && Math.abs(previous.lon - pos.lon) < 0.02 && previous.place;
  const named = samePlace ? { place: previous.place, country: previous.country } : await placeName(pos.lat, pos.lon);
  if (named && named.place) { pos.place = named.place; pos.country = named.country; }
  else if (plan && pos.plan_day_at_position) { const d = plan.days[pos.plan_day_at_position - 1]; pos.place = d.to; pos.country = ""; }

  C.writeData("position.json", pos);
  C.log(`position: ${pos.lat.toFixed(3)}, ${pos.lon.toFixed(3)} at ${pos.at} (${pos.place || "?"})`);
  return { newestItemAt: points[0].at };
}

module.exports = { run, parsePlacemarks };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
