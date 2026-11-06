/* Substack: the publication's RSS feed, for the latest written post on the home page. Audio posts
   (the dispatches) are in the feed too; they are kept, flagged, so the page can tell them apart.
   Writes site/data/substack.json. */
const C = require("./lib/common");

function firstImage(html) {
  const m = String(html || "").match(/<img\b[^>]*\ssrc="([^"]+)"/i);
  return m ? C.xml.decode(m[1]) : "";
}
function excerpt(html, max) {
  const text = C.xml.stripHTML(String(html || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "))).trim() + "…";
}

async function run(ctx) {
  const url = ctx.config.sources.substackRss || (ctx.config.links.substack || "").replace(/\/+$/, "") + "/feed";
  const text = await C.fetchText(url);
  const items = C.xml.blocks(text, "item").map(it => {
    const pub = Date.parse(C.xml.tag(it, "pubDate"));
    const body = C.xml.tag(it, "content:encoded");
    const encType = C.xml.attr(it, "enclosure", "type");
    return {
      id: C.xml.tag(it, "guid") || C.xml.tag(it, "link"),
      title: C.xml.tag(it, "title"),
      link: C.xml.tag(it, "link"),
      published_at: isNaN(pub) ? null : new Date(pub).toISOString(),
      subtitle: C.xml.stripHTML(C.xml.tag(it, "description")),
      excerpt: excerpt(body, 320),
      image: firstImage(body) || (/^image\//.test(encType) ? C.xml.attr(it, "enclosure", "url") : ""),
      author: C.xml.tag(it, "dc:creator"),
      is_audio: /^audio\//.test(encType) || /\/feed\/podcast\//.test(C.xml.attr(it, "enclosure", "url"))
    };
  }).filter(i => i.title).sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  C.writeData("substack.json", { fetched_at: new Date().toISOString(), items });
  const written = items.filter(i => !i.is_audio);
  C.log(`substack: ${items.length} post(s), ${written.length} written`);
  return { newestItemAt: written[0] ? written[0].published_at : null, note: written.length ? "" : "no written post yet" };
}

module.exports = { run };
if (require.main === module) run({ config: C.loadConfig() }).catch(e => { console.error(e); process.exit(1); });
