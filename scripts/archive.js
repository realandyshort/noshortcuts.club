/* Daily archive: archive/days/NNN.json for the current day, rewritten each hour until the day ends.
   Past days are never touched. Time travel (phase 3) reads these files. */
const fs = require("fs");
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

async function run(ctx) {
  const { plan, today, offset } = ctx;
  if (!plan || !(today >= 1) || today > plan.days.length) { C.log("archive: not a trip day, nothing to write"); return; }
  const ig = C.readData("instagram.json", { items: [] });
  const disp = C.readData("dispatches.json", { items: [] });
  const rides = C.readData("rides.json", { days: {} });
  const pos = C.readData("position.json", { available: false });
  const weather = C.readData("weather.json", { available: false });
  const countries = C.readJSON(path.join(C.P.seed, "countries.json"));
  const d = plan.days[today - 1];
  const ridden = Trip.ridesThrough(plan, rides.days, today);
  const file = path.join(C.P.archive, String(today).padStart(3, "0") + ".json");
  const snapshot = {
    day: today, written_at: new Date().toISOString(), plan: d,
    instagram: (ig.items || []).filter(p => Trip.dayOfTimestamp(plan, p.timestamp, offset) === today)
      .map(p => ({ id: p.id, media_url: p.media_url, permalink: p.permalink, caption: p.caption, timestamp: p.timestamp })),
    dispatches: (disp.items || []).filter(i => Trip.dayOfTimestamp(plan, i.published_at, offset) === today)
      .map(i => ({ id: i.id, title: i.title, audio: i.audio, link: i.link, published_at: i.published_at, duration_sec: i.duration_sec })),
    ride: rides.days ? rides.days[d.date] || null : null,
    position: pos.available ? { lat: pos.lat, lon: pos.lon, at: pos.at, place: pos.place || "", country: pos.country || "" } : null,
    weather: weather.available ? { temp_f: weather.temp_f, text: weather.text } : null,
    totals: {
      planned_miles: Math.round(Trip.plannedMilesThrough(plan, today)),
      ridden_miles: Math.round(ridden.miles), climb_ft: Math.round(ridden.climb_ft),
      countries: Trip.countriesEntered(countries, today)
    }
  };
  fs.mkdirSync(C.P.archive, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
  C.log(`archive: wrote day ${today}`);
}
module.exports = { run };
