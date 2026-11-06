/* One-time (rerun when a segment's Komoot collection changes): fills a segment of the seed route list
   from a public Komoot collection whose tours are named "S6D391 La Paz to Patacamaya". For every tour
   it sets that day's places, planned miles, planned climb and the tour link in seed/route_days_seed.csv.
   Days without a tour (rest and excursion days) are left as they are. The route sheet still wins
   whenever its own tab for the segment exists.
       node scripts/komoot-collection.js 4775335 6 */
const fs = require("fs");
const path = require("path");
const C = require("./lib/common");

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh) noshortcuts.club site robot" };
const [collectionId, sectionArg] = process.argv.slice(2);
if (!collectionId || !sectionArg) { console.error("usage: node scripts/komoot-collection.js <collectionId> <section>"); process.exit(1); }
const section = Number(sectionArg);

function csvCell(v) { v = String(v == null ? "" : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

async function main() {
  const tours = [];
  for (let page = 0; page < 40; page++) {
    const j = await C.fetchJSON(`https://api.komoot.de/v007/collections/${collectionId}/compilation/?page=${page}&limit=50`, { headers: UA, timeoutMs: 30000 });
    const items = (j._embedded && j._embedded.items) || [];
    tours.push(...items);
    if (!j.page || page >= j.page.totalPages - 1) break;
  }
  const re = new RegExp(`^S${section}D(\\d+)\\s+(.+?)\\s+to\\s+(.+)$`);
  const byDay = new Map();
  tours.forEach(t => {
    const m = re.exec(t.name || "");
    if (!m) { C.log(`komoot: skipped tour "${t.name}" (name not in S${section}D<day> A to B form)`); return; }
    byDay.set(Number(m[1]), { from: m[2].trim(), to: m[3].trim(), miles: +(t.distance / 1609.344).toFixed(1), climb: Math.round((t.elevation_up || 0) * 3.28084), url: `https://www.komoot.com/tour/${t.id}` });
  });
  const file = path.join(C.P.seed, "route_days_seed.csv");
  const rows = C.parseCSV(fs.readFileSync(file, "utf8"));
  const head = rows[0].map(h => h.trim());
  ["est_climb_ft", "route_url"].forEach(col => { if (head.indexOf(col) < 0) head.push(col); });
  const ix = name => head.indexOf(name);
  let updated = 0, prevTo = null;
  const out = rows.slice(1).map(r => {
    const row = head.map((h, i) => (r[i] || "").trim());
    if (Number(row[ix("section")]) !== section) return row;
    const day = Number(row[ix("day")]);
    const t = byDay.get(day);
    if (t) {
      row[ix("kind")] = "ride"; row[ix("from")] = t.from; row[ix("to")] = t.to;
      row[ix("est_miles")] = String(t.miles); row[ix("est_climb_ft")] = String(t.climb); row[ix("route_url")] = t.url;
      prevTo = t.to; updated++;
    } else if (prevTo) {                       // a day off: stays where the last ride ended
      row[ix("from")] = prevTo; row[ix("to")] = prevTo;
      if (!row[ix("kind")] || row[ix("kind")] === "ride") row[ix("kind")] = "rest";
      row[ix("est_miles")] = ""; row[ix("est_climb_ft")] = ""; row[ix("route_url")] = "";
    }
    return row;
  });
  fs.writeFileSync(file, [head].concat(out).map(r => r.map(csvCell).join(",")).join("\n") + "\n");
  const secDays = out.filter(r => Number(r[ix("section")]) === section);
  const miles = secDays.reduce((s, r) => s + (parseFloat(r[ix("est_miles")]) || 0), 0);
  const climb = secDays.reduce((s, r) => s + (parseFloat(r[ix("est_climb_ft")]) || 0), 0);
  C.log(`komoot collection ${collectionId}: ${tours.length} tours, ${updated} ride days of section ${section} updated; section now ${secDays.length} days, ${Math.round(miles)} mi, ${Math.round(climb)} ft of climb, ${secDays.filter(r => r[ix("kind")] !== "ride").length} days off`);
  const missing = [...byDay.keys()].filter(d => !secDays.some(r => Number(r[ix("day")]) === d));
  if (missing.length) C.log(`komoot: tours for days not in the seed list: ${missing.join(", ")}`);
}
main().catch(e => { console.error(e); process.exit(1); });
