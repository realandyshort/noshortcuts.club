/* One-time: elevation for every point of seed/route_line.json from Open-Meteo (free, no key).
   Writes seed/route_elevation.json, which is committed, so this never runs in the hourly robot.
   Run again only if route_line.json changes:   node scripts/fetch-elevation.js */
const path = require("path");
const C = require("./lib/common");

async function main() {
  const route = C.readJSON(path.join(C.P.seed, "route_line.json"));
  const pts = route.points, out = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map(p => p[0]).join(",")}&longitude=${chunk.map(p => p[1]).join(",")}`;
    let j = null;
    for (let attempt = 0; attempt < 4 && !j; attempt++) {
      try { j = await C.fetchJSON(url); }
      catch (e) { if (!/429/.test(e.message)) throw e; C.log("elevation: rate limited, waiting a minute"); await new Promise(r => setTimeout(r, 65000)); }
    }
    out.push(...j.elevation.map(m => Math.round(m)));
    C.log(`elevation: ${out.length}/${pts.length}`);
    await new Promise(r => setTimeout(r, 15000));   // the free tier allows only a few calls a minute
  }
  C.writeJSON(path.join(C.P.seed, "route_elevation.json"), {
    note: "Elevation in meters for each point of route_line.json, from Open-Meteo's elevation API (Copernicus DEM). Same order as the points.",
    elevation_m: out
  });
  const ft = out.map(m => m * 3.28084);
  C.log(`done. highest ${Math.round(Math.max(...ft))} ft, lowest ${Math.round(Math.min(...ft))} ft`);
}
main().catch(e => { console.error(e); process.exit(1); });
