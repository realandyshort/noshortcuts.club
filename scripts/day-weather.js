/* Hottest and coldest day (robot step). For each day of the ride, the daily high and low at the
   place where the day ends, from Open-Meteo's free historical weather archive. Before the trip the
   same calendar dates two years earlier stand in, marked as a sample. Results are cached in
   site/data/day_weather.json; a failed lookup keeps the last good value and is retried later. */
const path = require("path");
const C = require("./lib/common");

async function run(ctx) {
  const plan = ctx.plan || C.readData("plan.json");
  const today = typeof ctx.today === "number" ? ctx.today : -1;
  const pts = C.readJSON(path.join(C.P.seed, "day_points.json"), { days: {} }).days;
  const pos = C.readData("position.json", { available: false });
  const out = C.readData("day_weather.json", { days: {} });
  const perRun = 40;
  let done = 0;
  for (const d of plan.days) {
    if (done >= perRun) break;
    const sample = d.day > today;                         // not ridden yet: use the sample years
    const have = out.days[d.day];
    if (have && !have.sample) continue;                   // a real day, already looked up
    if (have && have.sample && sample) continue;          // a sample, still a sample
    // Where: the real (delayed) position on that day when we have it, else the plan's end place
    const arch = sample ? null : C.readJSON(path.join(C.P.archive, String(d.day).padStart(3, "0") + ".json"), null);
    const at = (arch && arch.position) ? arch.position : (pts[d.day] && pts[d.day].end) || null;
    if (!at) continue;
    // Sample years: the same calendar date two years earlier, or three if two is not yet in the past
    const back = y => d.date.replace(/^(\d{4})/, (m, yr) => String(Number(yr) - y));
    const ymd = sample ? (Date.parse(back(2)) < Date.now() - 3 * 86400000 ? back(2) : back(3)) : d.date;
    if (!sample && Date.parse(ymd) > Date.now() - 2 * 86400000) continue;   // the archive lags a couple of days
    try {
      const j = await C.fetchJSON(`https://archive-api.open-meteo.com/v1/archive?latitude=${at.lat}&longitude=${at.lon}&start_date=${ymd}&end_date=${ymd}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto`, { timeoutMs: 30000 });
      const tmax = j.daily && j.daily.temperature_2m_max && j.daily.temperature_2m_max[0];
      const tmin = j.daily && j.daily.temperature_2m_min && j.daily.temperature_2m_min[0];
      if (tmax == null || tmin == null) throw new Error("no daily values");
      out.days[d.day] = { tmax_f: Math.round(tmax), tmin_f: Math.round(tmin), place: at.place || d.to || d.from || "", sample, looked_up_at: new Date().toISOString() };
      done++;
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { C.log(`day weather: day ${d.day}: ${e.message.slice(0, 80)} (kept previous)`); if (/429/.test(e.message)) break; }
  }
  if (done) C.log(`day weather: ${done} day(s) looked up`);
  out.generated_at = new Date().toISOString();
  C.writeData("day_weather.json", out);
}
module.exports = { run };
if (require.main === module) run({ today: -1 }).catch(e => { console.error(e); process.exit(1); });
