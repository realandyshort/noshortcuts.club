/* Day photo thumbnails for the days mosaic on the home page. For each archived day with an Instagram
   photo it saves a small square copy (120 px, a few KB) under site/assets/thumbs/NNN.jpg and lists it in
   site/data/photo_index.json. Needs the "sharp" package; without it, or if a download fails, the index
   keeps what it has and the page shows sketches instead. A few dozen per run at most. */
const fs = require("fs");
const path = require("path");
const C = require("./lib/common");

const SIZE = 120, PER_RUN = 40;

async function run(ctx) {
  let sharp;
  try { sharp = require("sharp"); } catch (e) { C.log("thumbs: sharp is not installed; skipping"); return {}; }
  const dir = path.join(C.P.site, "assets", "thumbs");
  fs.mkdirSync(dir, { recursive: true });
  const index = C.readData("photo_index.json", { note: "Thumbnails of each day's first Instagram photo, for the days mosaic. Made by scripts/thumbs.js.", days: {} });
  const archDir = path.join(C.P.root, "archive", "days");
  if (!fs.existsSync(archDir)) return {};
  let made = 0, failed = 0;
  for (const file of fs.readdirSync(archDir).sort()) {
    if (!/^\d{3}\.json$/.test(file)) continue;
    const n = String(Number(file.slice(0, 3)));
    if (index.days[n]) continue;
    const a = C.readJSON(path.join(archDir, file), null);
    const post = a && a.instagram && a.instagram[0];
    if (!post || !post.media_url) continue;
    if (made >= PER_RUN) break;
    try {
      const res = await fetch(post.media_url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const out = path.join(dir, file.replace(".json", ".jpg"));
      await sharp(buf).resize(SIZE, SIZE, { fit: "cover" }).jpeg({ quality: 72 }).toFile(out);
      index.days[n] = { thumb: "assets/thumbs/" + path.basename(out), link: post.permalink || "" };
      made++;
    } catch (e) { failed++; C.log(`thumbs: day ${n}: ${e.message.slice(0, 80)}`); }
  }
  C.writeData("photo_index.json", index);
  C.log(`thumbs: ${made} made, ${failed} failed, ${Object.keys(index.days).length} in the index`);
  return {};
}
module.exports = { run };
if (require.main === module) run({}).catch(e => { console.error(e); process.exit(1); });
