/* The hourly robot. Runs every fetcher, records each source's status, writes the daily archive,
   makes (and when live, posts) Instagram stories for new dispatches, and raises or clears alerts.
   One source failing never stops the others.

   Flags: --no-alerts  --no-stories  --only=plan,dispatches  */
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

const SOURCES = [
  ["plan", require("./fetch-plan")],
  ["dispatches", require("./fetch-dispatches")],
  ["instagram", require("./fetch-instagram")],
  ["videos", require("./fetch-videos")],
  ["rides", require("./fetch-rides")],
  ["position", require("./fetch-position")],
  ["weather", require("./fetch-weather")]
];

async function main() {
  const config = C.loadConfig();
  const status = C.loadStatus();
  const only = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const brokenAfter = (config.alerts || {}).brokenAfterFailures || 2;

  for (const [name, mod] of SOURCES) {
    if (only.length && !only.includes(name)) continue;
    try {
      const r = (await mod.run({ config, status })) || {};
      let entry;
      if (r.notConnected) entry = C.recordNotConnected(status, name, r.notConnected);
      else if (r.skipped) entry = C.recordSkipped(status, name, r.skipped);
      else entry = C.recordSuccess(status, name, r);
      if (r.extra) Object.assign(entry, r.extra);
    } catch (e) {
      const entry = C.recordFailure(status, name, e, brokenAfter);
      C.log(`${name}: FAILED (${entry.consecutive_failures} in a row, state ${entry.state}): ${entry.last_error}`);
    }
    C.saveStatus(status);
  }

  // A small file the pages read for "what day is it" so every visitor sees the same day.
  const plan = C.readData("plan.json", null);
  const weather = C.readData("weather.json", {});
  const offset = typeof weather.utc_offset_seconds === "number" ? weather.utc_offset_seconds : (config.trip.fallbackUtcOffsetHours || 0) * 3600;
  const today = plan ? Trip.dayNumberAt(plan, Date.now(), offset) : null;
  C.writeData("meta.json", { generated_at: new Date().toISOString(), today_day: today, utc_offset_seconds: offset, timezone: weather.timezone || null });
  C.log(`today is day ${today}`);

  await safe("archive", () => require("./archive").run({ config, status, plan, today, offset }));
  if (!C.hasFlag("--no-stories")) await safe("stories", () => require("./story").run({ config, status, plan, offset }));
  if (!C.hasFlag("--no-alerts")) await safe("alerts", () => require("./alerts").run({ config, status }));
  C.saveStatus(status);
}

async function safe(label, fn) {
  try { await fn(); } catch (e) { C.log(`${label}: FAILED: ${e.message}`); }
}

main().catch(e => { console.error(e); process.exit(1); });
