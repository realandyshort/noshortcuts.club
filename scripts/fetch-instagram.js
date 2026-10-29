/* Instagram: newest posts for the photo sections. Needs the IG_ACCESS_TOKEN and IG_USER_ID secrets.
   Until they exist the source is "not_connected" and the pages show brand placeholders instead.
   The switch to real photos happens on the first run after the secrets appear, with no code change. */
const crypto = require("crypto");
const C = require("./lib/common");

function hosts(ctx) {
  const st = (ctx.status && ctx.status.sources && ctx.status.sources.instagram) || {};
  const configured = (ctx.config.sources.instagramApiHost || "graph.instagram.com").replace(/^https?:\/\//, "");
  const token = C.env("IG_ACCESS_TOKEN");
  const guess = /^EAA/.test(token) ? "graph.facebook.com" : /^IG/.test(token) ? "graph.instagram.com" : null;
  return Array.from(new Set([st.api_host, guess, configured, "graph.instagram.com", "graph.facebook.com"].filter(Boolean)));
}
// Runs fn(host) against each candidate host until one answers; records the winner in status.
async function withHost(ctx, fn) {
  let lastErr = null;
  for (const host of hosts(ctx)) {
    try { const r = await fn(host); ctx.apiHost = host; return r; }
    catch (e) { lastErr = e; if (!/190|OAuth|parse access token|400/.test(e.message)) throw e; }
  }
  throw lastErr;
}

async function run(ctx) {
  const token = C.env("IG_ACCESS_TOKEN").replace(/^["']|["']$/g, ""), userId = C.env("IG_USER_ID").replace(/^["']|["']$/g, "");
  const previous = C.readData("instagram.json", { items: [] });
  if (!token || !userId) {
    C.writeData("instagram.json", { fetched_at: new Date().toISOString(), connected: false, items: [] });
    return { notConnected: "IG_ACCESS_TOKEN / IG_USER_ID not set" };
  }
  // Two Meta routes exist: Instagram login (graph.instagram.com, tokens start "IGAA") and Facebook
  // login (graph.facebook.com, tokens start "EAA"). Try the configured host first, then the other,
  // and remember which one worked so the story poster uses the same.
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const limit = ctx.config.sources.instagramPostLimit || 60;
  const json = await withHost(ctx, host => C.fetchJSON(`https://${host}/v21.0/${encodeURIComponent(userId)}/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(token)}`));
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
  return { newestItemAt: items[0] ? items[0].timestamp : null, extra: { token_fingerprint: fp, token_first_seen_at: tokenSeen, api_host: ctx.apiHost } };
}

module.exports = { run, hosts };
if (require.main === module) run({ config: C.loadConfig(), status: C.loadStatus() }).catch(e => { console.error(e); process.exit(1); });
