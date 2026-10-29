/* Dispatches: the podcast RSS feed (Spotify for Creators / Anchor). Writes site/data/dispatches.json. */
const C = require("./lib/common");

function durationSec(s) {
  if (!s) return 0;
  const parts = String(s).trim().split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  return parts.reduce((t, p) => t * 60 + p, 0);
}

async function run(ctx) {
  const url = ctx.config.sources.dispatchesRss;
  const text = await C.fetchText(url);
  const channel = C.xml.blocks(text, "channel")[0] || text;
  const show = {
    title: C.xml.tag(channel.split("<item")[0], "title"),
    link: C.xml.tag(channel.split("<item")[0], "link"),
    image: C.xml.attr(channel.split("<item")[0], "itunes:image", "href")
  };
  const items = C.xml.blocks(text, "item").map(it => {
    const pub = Date.parse(C.xml.tag(it, "pubDate"));
    return {
      id: C.xml.tag(it, "guid") || C.xml.attr(it, "enclosure", "url"),
      title: C.xml.tag(it, "title"),
      link: C.xml.tag(it, "link"),
      audio: C.xml.attr(it, "enclosure", "url"),
      audio_type: C.xml.attr(it, "enclosure", "type"),
      published_at: isNaN(pub) ? null : new Date(pub).toISOString(),
      duration_sec: durationSec(C.xml.tag(it, "itunes:duration")),
      description: C.xml.stripHTML(C.xml.tag(it, "description") || C.xml.tag(it, "itunes:summary")),
      image: C.xml.attr(it, "itunes:image", "href") || show.image,
      episode: Number(C.xml.tag(it, "itunes:episode")) || null
    };
  }).filter(i => i.audio).sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));

  C.writeData("dispatches.json", { fetched_at: new Date().toISOString(), show, items });
  C.log(`dispatches: ${items.length} item(s)`);
  return { newestItemAt: items[0] ? items[0].published_at : null };
}

module.exports = { run };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
