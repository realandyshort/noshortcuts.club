/* Prints "home" or "coming-soon": which page should be served at / right now.
   Before day 1 of the plan the coming-soon page is the front door. Used by the deploy workflow. */
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

function decide(now) {
  const config = C.loadConfig();
  let plan = C.readData("plan.json", null);
  if (!plan) { const seed = require("./fetch-plan").seedDays(); plan = { day1_date: seed[0].date, days: seed }; }
  const weather = C.readData("weather.json", {});
  const offset = typeof weather.utc_offset_seconds === "number" ? weather.utc_offset_seconds : (config.trip.fallbackUtcOffsetHours || 0) * 3600;
  const day = Trip.dayNumberAt(plan, now || Date.now(), offset);
  return { page: day >= 1 ? "home" : "coming-soon", day, offset };
}
module.exports = { decide };
if (require.main === module) { const r = decide(); if (process.argv.includes("--verbose")) console.error(r); console.log(r.page); }
