/* Instagram: newest posts for the photo sections. Needs the IG_ACCESS_TOKEN and IG_USER_ID secrets.
   Until they exist the source is "not_connected" and the pages show brand placeholders instead.
   The switch to real photos happens on the first run after the secrets appear, with no code change. */
const crypto = require("crypto");
const C = require("./lib/common");

async function run(ctx) {
  const token = C.env("IG_ACCESS_TOKEN"), userId = C.env("IG_USER_ID");
  const previous = C.readData("instagram.json", { items: [] });
  if (!token || !userId) {
    C.writeData("instagram.json", { fetched_at: new Date().toISOString(), connected: false, items: [] });
    return { notConnected: "IG_ACCESS_TOKEN / IG_USER_ID not set" };
  }
  const host = (ctx.config.sources.instagramApiHost || "graph.instagram.com").replace(/^https?:\/\//, "");
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const limit = ctx.config.sources.instagramPostLimit || 60;
  const url = `https://${host}/v21.0/${encodeURIComponent(userId)}/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(token)}`;
  const json = await C.fetchJSON(url);
  const items = (json.data || []).map(m => ({
    id: m.id, caption: m.caption || "", media_type: m.media_type,
    media_url: m.media_type === "VIDEO" ? (m.thumbnail_url || m.media_url) : m.media_url,
    permalink: m.permalink, timestamp: m.timestamp
  })).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Remember when this token was first seen (a fingerprint, never the token) so alerts.js can
  // warn before the 60-day expiry. Regenerating the token resets the clock.
  const fp = crypto.createHash("sha256").update(token).digest("hex").slice(0, 8);
  const st = ctx.status.sources.instagram || {};
  const tokenSeen = st.token_fingerprint === fp && st.token_first_seen_at ? st.token_first_seen_at : new Date().toISOString();

  C.writeData("instagram.json", { fetched_at: new Date().toISOString(), connected: true, items: items.length ? items : previous.items || [] });
  C.log(`instagram: ${items.length} post(s)`);
  return { newestItemAt: items[0] ? items[0].timestamp : null, extra: { token_fingerprint: fp, token_first_seen_at: tokenSeen } };
}

module.exports = { run };
if (require.main === module) run({ config: C.loadConfig(), status: C.loadStatus() }).catch(e => { console.error(e); process.exit(1); });
