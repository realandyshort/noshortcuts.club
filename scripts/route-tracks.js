/* One-time (rerun after scripts/komoot-routes.js): the real planned route for the full map page, day by
   day, from the Komoot tracks in seed/day_tracks.json (thinned a little more, no altitude). Days without
   a track get an empty list; the map bridges them with a straight line between their start and end.
   Writes seed/route_tracks.json, which the deploy copies to the site.      node scripts/route-tracks.js */
const path = require("path");
const C = require("./lib/common");
const Trip = require("../site/js/trip.js");

function thin(points, stepMi) {
  const out = [points[0]]; let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += Trip.haversineMi(points[i - 1], points[i]);
    if (acc >= stepMi || i === points.length - 1) { out.push(points[i]); acc = 0; }
  }
  return out;
}
const tracks = C.readJSON(path.join(C.P.seed, "day_tracks.json"), { days: {} }).days;
const plan = C.readData("plan.json");
const days = {};
let withTrack = 0, pts = 0;
plan.days.forEach(d => {
  const t = tracks[d.day];
  if (t && t.points && t.points.length > 1) { days[d.day] = thin(t.points, 0.45).map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]); withTrack++; pts += days[d.day].length; }
  else days[d.day] = [];
});
const file = path.join(C.P.seed, "route_tracks.json");
require("fs").writeFileSync(file, JSON.stringify({ note: "The planned route day by day from Komoot, thinned to about one point per 0.45 miles, [lat, lon]. Days without a public Komoot tour are empty; the map bridges them. Built by scripts/route-tracks.js.", days }));   // compact: it ships to the site
C.log(`route tracks: ${withTrack} of ${plan.days.length} days have a track, ${pts} points, ${Math.round(require("fs").statSync(file).size / 1024)} KB`);
