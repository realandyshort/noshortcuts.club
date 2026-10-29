/* Weather at the (delayed) position, from Open-Meteo. No key needed. Also gives the local time zone. */
const C = require("./lib/common");

const WMO = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers",
  86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" };

async function run(ctx) {
  const pos = C.readData("position.json", { available: false });
  if (!pos.available) { C.writeData("weather.json", { fetched_at: new Date().toISOString(), available: false }); return { skipped: "no position" }; }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}&current=temperature_2m,weather_code,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const j = await C.fetchJSON(url);
  const cur = j.current || {};
  const out = {
    fetched_at: new Date().toISOString(), available: true,
    temp_f: Math.round(cur.temperature_2m), code: cur.weather_code, text: WMO[cur.weather_code] || "",
    wind_mph: Math.round(cur.wind_speed_10m || 0), is_day: cur.is_day,
    timezone: j.timezone, utc_offset_seconds: j.utc_offset_seconds, elevation_m: j.elevation
  };
  C.writeData("weather.json", out);
  C.log(`weather: ${out.temp_f}°F ${out.text} (${out.timezone})`);
  return { newestItemAt: out.fetched_at };
}

module.exports = { run };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
