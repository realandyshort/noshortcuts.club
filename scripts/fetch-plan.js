/* Route plan: reads each "Segment N" tab of the public Google Sheet as CSV and normalises it to
   the seed schema. Tabs that do not exist yet (Segment 6 today) come from seed/route_days_seed.csv,
   and switch to the sheet automatically the moment the tab appears. Never leaves a gap in the days.

   Gotcha: asking the sheet for a tab name that does not exist returns the FIRST tab instead of an
   error, so a tab only counts if its header starts with "Date", "Day #". */

const fs = require("fs");
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

const KEYWORDS = {
  boat: /\b(ferry|boat|sail|lancha|barco|catamaran)\b/i,
  border: /\b(border|frontera|crossing|cross into|customs|aduana)\b/i
};

function seedDays() {
  const rows = C.parseCSV(fs.readFileSync(path.join(C.P.seed, "route_days_seed.csv"), "utf8"));
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const o = {}; head.forEach((h, i) => o[h] = (r[i] || "").trim());
    return {
      section: Number(o.section), day: Number(o.day), date: o.date, kind: o.kind || "ride",
      from: o.from, to: o.to, plan_miles: num(o.est_miles), plan_climb_ft: 0,
      terrain: o.terrain || "", notes: Trip.scrubDates(o.notes || ""), route_url: "", stay: ""
    };
  }).filter(d => d.day > 0);
}

function num(s) { const n = parseFloat(String(s || "").replace(/,/g, "")); return isFinite(n) ? n : 0; }

// "6/18/27" or "6/18/2027" or "2027-06-18" -> "2027-06-18"
function isoDate(s) {
  s = String(s || "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (!m) return "";
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function inferKind(row, seedDay) {
  const hasMiles = row.plan_miles > 0;
  const text = `${row.notes} ${row.route_url} ${row.terrain}`;
  if (seedDay && seedDay.from === row.from && seedDay.to === row.to) {
    const seedRest = seedDay.kind === "rest";
    if (seedRest === !hasMiles) return seedDay.kind;        // seed agrees with the mileage
  }
  if (KEYWORDS.boat.test(text) || /ferry|boat/i.test(row.route_url)) return "boat";
  if (!hasMiles) return "rest";
  if (KEYWORDS.border.test(text)) return "border";
  return "ride";
}

function parseTab(csvText, section, seedByDay) {
  const rows = C.parseCSV(csvText);
  if (!rows.length) return null;
  const head = rows[0].map(h => h.trim().toLowerCase());
  if (head[0] !== "date" || !/^day/.test(head[1] || "")) return null;   // not a segment tab
  const col = name => head.findIndex(h => h.startsWith(name));
  const ix = {
    date: 0, day: 1, from: col("departure"), to: col("destination"), miles: col("mileage"),
    climb: col("elevation"), route: col("route"), stay: col("accom"), notes: col("notes")
  };
  const get = (r, i) => (i >= 0 && r[i] ? r[i].trim() : "");
  const days = [];
  rows.slice(1).forEach(r => {
    const dayNo = parseInt(get(r, ix.day), 10);
    if (!(dayNo > 0)) return;                                    // TOTALS row, blanks
    const d = {
      section, day: dayNo, date: isoDate(get(r, ix.date)), kind: "ride",
      from: get(r, ix.from), to: get(r, ix.to),
      plan_miles: num(get(r, ix.miles)), plan_climb_ft: num(get(r, ix.climb)),
      terrain: "", notes: Trip.scrubDates(get(r, ix.notes)), route_url: /^https?:/.test(get(r, ix.route)) ? get(r, ix.route) : "",
      stay: get(r, ix.stay)
    };
    const seedDay = seedByDay.get(dayNo);
    if (seedDay) { d.terrain = seedDay.terrain; if (!d.date) d.date = seedDay.date; }
    d.kind = inferKind(d, seedDay);
    days.push(d);
  });
  return days;
}

async function run(ctx) {
  const cfg = ctx.config.plan || {};
  const sheetId = cfg.sheetId;
  const tabs = cfg.tabs || 6;
  const prefix = cfg.tabPrefix || "Segment ";
  const seed = seedDays();
  const seedByDay = new Map(seed.map(d => [d.day, d]));
  const previous = C.readData("plan.json", null);

  const byDay = new Map();
  const source = {};
  let networkError = null;

  for (let s = 1; s <= tabs; s++) {
    const tab = `${prefix}${s}`;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    let days = null, why = "";
    try {
      days = parseTab(await C.fetchText(url), s, seedByDay);
      why = days ? "sheet" : "seed (tab not in sheet yet)";
    } catch (e) {
      networkError = networkError || e;
      // keep the last good copy of this section if we have one
      const prev = previous && previous.days ? previous.days.filter(d => d.section === s && previous.source[s] === "sheet") : [];
      if (prev.length) { days = prev; why = "last good copy"; } else { why = `seed (fetch failed: ${e.message.slice(0, 80)})`; }
    }
    source[s] = why;
    (days || []).forEach(d => byDay.set(d.day, d));
  }

  // Fill anything missing from the seed, so the 543 days are always complete.
  seed.forEach(d => { if (!byDay.has(d.day)) byDay.set(d.day, d); });
  const days = Array.from(byDay.values()).sort((a, b) => a.day - b.day);

  // Make dates contiguous from day 1 if any row lacks one.
  const day1 = days[0].date || seed[0].date;
  const t0 = Date.parse(day1 + "T00:00:00Z");
  days.forEach((d, i) => { if (!d.date) d.date = new Date(t0 + i * 86400000).toISOString().slice(0, 10); });

  const totals = days.reduce((t, d) => { t.miles += d.plan_miles; t.climb_ft += d.plan_climb_ft; return t; }, { miles: 0, climb_ft: 0 });
  const plan = {
    generated_at: new Date().toISOString(), day1_date: day1, total_days: days.length,
    source, totals: { miles: Math.round(totals.miles * 10) / 10, climb_ft: Math.round(totals.climb_ft) }, days
  };
  C.writeData("plan.json", plan);
  C.log(`plan: ${days.length} days; sections: ${Object.entries(source).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (networkError) throw networkError;        // recorded as a failure, but the plan file above is still complete
  return { newestItemAt: plan.generated_at, note: Object.values(source).every(v => v === "sheet") ? "all tabs from the sheet" : "some sections from the seed" };
}

module.exports = { run, parseTab, seedDays };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
