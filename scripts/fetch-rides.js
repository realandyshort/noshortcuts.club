/* Rides: Intervals.icu (Garmin syncs rides there). Needs INTERVALS_API_KEY and INTERVALS_ATHLETE_ID.
   Writes per-local-date totals to site/data/rides.json. Not connected = pages use plan numbers. */
const C = require("./lib/common");

const M_TO_MI = 0.000621371, M_TO_FT = 3.28084;

async function run(ctx) {
  const key = C.env("INTERVALS_API_KEY"), athlete = C.env("INTERVALS_ATHLETE_ID");
  const previous = C.readData("rides.json", { days: {} });
  if (!key || !athlete) {
    C.writeData("rides.json", { fetched_at: new Date().toISOString(), connected: false, days: {} });
    return { notConnected: "INTERVALS_API_KEY / INTERVALS_ATHLETE_ID not set" };
  }
  const plan = C.readData("plan.json");
  const oldest = plan.day1_date;
  const newest = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(athlete)}/activities?oldest=${oldest}&newest=${newest}`;
  const auth = "Basic " + Buffer.from(`API_KEY:${key}`).toString("base64");
  const list = await C.fetchJSON(url, { headers: { Authorization: auth } });

  const days = Object.assign({}, previous.days || {});
  const touched = {};
  (Array.isArray(list) ? list : []).forEach(a => {
    if (!/ride|cycling|bike/i.test(a.type || "")) return;
    const date = String(a.start_date_local || a.start_date || "").slice(0, 10);
    if (!date) return;
    if (!touched[date]) { touched[date] = true; days[date] = { miles: 0, climb_ft: 0, moving_sec: 0, max_alt_ft: 0, rides: 0, calories: 0, cadence_x_time: 0, ids: [] }; }
    const d = days[date];
    d.miles += (a.distance || 0) * M_TO_MI;
    d.climb_ft += (a.total_elevation_gain || 0) * M_TO_FT;
    d.moving_sec += a.moving_time || 0;
    d.max_alt_ft = Math.max(d.max_alt_ft, (a.max_altitude || 0) * M_TO_FT);
    d.calories += a.calories || 0;                                   // Garmin's own estimate, when it sent one
    if (a.average_cadence && a.moving_time) d.cadence_x_time += a.average_cadence * a.moving_time;
    d.ids.push(a.id);
    d.rides += 1;
  });
  Object.values(days).forEach(d => {
    d.miles = Math.round(d.miles * 10) / 10; d.climb_ft = Math.round(d.climb_ft); d.max_alt_ft = Math.round(d.max_alt_ft);
    d.calories = Math.round(d.calories) || null;
    d.cadence = d.cadence_x_time && d.moving_sec ? Math.round(d.cadence_x_time / d.moving_sec) : null;   // moving-time weighted
    delete d.cadence_x_time;
  });
  const dates = Object.keys(days).sort();
  C.writeData("rides.json", { fetched_at: new Date().toISOString(), connected: true, days });
  C.log(`rides: ${dates.length} day(s) with rides`);
  return { newestItemAt: dates.length ? dates[dates.length - 1] + "T12:00:00Z" : null };
}

module.exports = { run };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
