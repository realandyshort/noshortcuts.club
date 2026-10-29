/* Videos: the YouTube playlist feed. Off by default (sections.videos.enabled in config). */
const C = require("./lib/common");

async function run(ctx) {
  const videos = (ctx.config.sections || {}).videos || {};
  if (!videos.enabled) { C.writeData("videos.json", { fetched_at: new Date().toISOString(), enabled: false, items: [] }); return { skipped: "videos are turned off in config" }; }
  const id = ctx.config.sources.youtubePlaylistId;
  const text = await C.fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(id)}`);
  const items = C.xml.blocks(text, "entry").map(e => ({
    id: C.xml.tag(e, "yt:videoId"),
    title: C.xml.tag(e, "title"),
    published_at: C.xml.tag(e, "published"),
    url: `https://www.youtube.com/watch?v=${C.xml.tag(e, "yt:videoId")}`,
    thumbnail: C.xml.attr(e, "media:thumbnail", "url")
  })).filter(v => v.id).sort((a, b) => b.published_at.localeCompare(a.published_at));
  C.writeData("videos.json", { fetched_at: new Date().toISOString(), enabled: true, items });
  C.log(`videos: ${items.length}`);
  return { newestItemAt: items[0] ? items[0].published_at : null };
}

module.exports = { run };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
