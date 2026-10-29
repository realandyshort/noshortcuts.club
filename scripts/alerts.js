/* Email alerts without any extra accounts: GitHub Issues. GitHub emails the account owner when an
   issue is opened, commented on or closed. Runs inside the hourly workflow with GITHUB_TOKEN.

   One issue per problem, found again by a hidden marker in its body:
     broken <source>   the source has failed 2+ runs in a row (title carries the outage length)
     quiet <source>    the source works but has had nothing new for longer than the threshold
     token instagram   the Instagram token is getting old and should be regenerated
   Each updates once a day and closes itself when things recover. */
const C = require("./lib/common");

const LABEL = "site-alert";
const NAMES = { plan: "Route plan", dispatches: "Dispatches", instagram: "Instagram", videos: "Videos",
  rides: "Rides (Intervals.icu)", position: "Position (Garmin)", weather: "Weather" };
const HELP = {
  plan: "The public route-plan sheet could not be read. Check that the sheet is still shared as 'anyone with the link can view' and that the tabs are still named Segment 1, Segment 2 and so on. Meanwhile the site keeps using the last good copy, so nothing is missing for visitors.",
  dispatches: "The podcast feed could not be read. Check that the show still exists in Spotify for Creators and that the RSS address in config/site.config.json is right. The dispatch panel is hidden until this recovers.",
  instagram: "Instagram posts could not be fetched. Most often the access token has expired: generate a new one in the Meta app and update the IG_ACCESS_TOKEN secret. Photo sections show placeholders until this recovers.",
  videos: "The YouTube playlist feed could not be read. Check the playlist ID in config. The video section is hidden until this recovers.",
  rides: "Intervals.icu could not be read. Check that the API key is still valid (Intervals.icu > Settings > Developer). Counters fall back to plan numbers until this recovers.",
  position: "The Garmin MapShare feed could not be read. Check that MapShare is turned on and public at share.garmin.com. The position marker and NOW band are hidden until this recovers.",
  weather: "Open-Meteo could not be read. Nothing to do; it usually clears on its own. Only the weather text is hidden."
};

function duration(ms) {
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24), hr = h % 24;
  if (d && hr) return `${d} day${d > 1 ? "s" : ""} ${hr} hour${hr > 1 ? "s" : ""}`;
  if (d) return `${d} day${d > 1 ? "s" : ""}`;
  return `${Math.max(1, hr)} hour${hr !== 1 ? "s" : ""}`;
}

async function run(ctx) {
  const token = C.env("GITHUB_TOKEN"), repo = C.env("GITHUB_REPOSITORY");
  if (!token || !repo) { C.log("alerts: no GITHUB_TOKEN/GITHUB_REPOSITORY, skipping (normal when running locally)"); return; }
  const api = async (method, path, body) => {
    const text = await C.fetchText(`https://api.github.com${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: body ? JSON.stringify(body) : undefined
    });
    return text ? JSON.parse(text) : null;
  };
  try { await api("POST", `/repos/${repo}/labels`, { name: LABEL, color: "E8593D", description: "Opened automatically by the site robot" }); } catch (e) { /* exists */ }

  const open = await api("GET", `/repos/${repo}/issues?state=open&labels=${LABEL}&per_page=100`);
  const find = key => (open || []).find(i => (i.body || "").includes(`<!-- noshortcuts-alert ${key} -->`));
  const now = Date.now();
  const alerts = ctx.config.alerts || {};
  const quietDays = alerts.nothingNewDays || {};
  const state = ctx.status.alerts = ctx.status.alerts || {};

  const upsert = async (key, title, body, source) => {
    const marker = `<!-- noshortcuts-alert ${key} -->`;
    let issue = find(key);
    const rec = state[key] = state[key] || {};
    if (!issue) {
      issue = await api("POST", `/repos/${repo}/issues`, { title, body: `${body}\n\n${marker}`, labels: [LABEL] });
      rec.issue = issue.number; rec.last_update_at = new Date(now).toISOString();
      C.log(`alerts: opened #${issue.number} ${title}`);
      return;
    }
    rec.issue = issue.number;
    const last = Date.parse(rec.last_update_at || issue.created_at);
    if (now - last >= 24 * 3600000) {
      await api("PATCH", `/repos/${repo}/issues/${issue.number}`, { title });
      await api("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: `Still going: ${title}` });
      rec.last_update_at = new Date(now).toISOString();
      C.log(`alerts: updated #${issue.number} ${title}`);
    }
  };
  const resolve = async (key, note) => {
    const issue = find(key);
    if (!issue) return;
    await api("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: note });
    await api("PATCH", `/repos/${repo}/issues/${issue.number}`, { state: "closed" });
    delete state[key];
    C.log(`alerts: closed #${issue.number}`);
  };

  for (const [source, s] of Object.entries(ctx.status.sources || {})) {
    const name = NAMES[source] || source;
    if (s.state === "broken") {
      const since = s.last_success_at ? now - Date.parse(s.last_success_at) : now - Date.parse(s.last_attempt_at);
      await upsert(`broken ${source}`, `${name} sync broken: no successful update for ${duration(since)}`,
        `**${name} has failed ${s.consecutive_failures} hourly runs in a row.**\n\nLast error:\n\n\`\`\`\n${s.last_error || "unknown"}\n\`\`\`\n\n${HELP[source] || ""}\n\nThis issue updates once a day and closes itself when the source works again.`, source);
    } else if (s.state === "ok") {
      await resolve(`broken ${source}`, `${name} is working again. Closing.`);
    }
    // Working but nothing new for a while (not an outage). Only once the ride has started:
    // before day 1 a quiet feed is normal, not news.
    const limit = quietDays[source];
    const onTheRoad = typeof ctx.today === "number" && ctx.today >= 1;
    if (limit && s.state === "ok" && s.last_new_item_at && onTheRoad) {
      const age = now - Date.parse(s.last_new_item_at);
      if (age > limit * 86400000) {
        await upsert(`quiet ${source}`, `${name}: nothing new for ${duration(age)} (not broken)`,
          `**${name} is working, but nothing new has arrived for ${duration(age)}.** The threshold is ${limit} days (alerts.nothingNewDays in config).\n\nThis is a nudge, not an outage. It closes itself when something new shows up.`, source);
      } else await resolve(`quiet ${source}`, `Something new arrived. Closing.`);
    } else if (limit && !onTheRoad) await resolve(`quiet ${source}`, `Quiet-feed nudges start on day 1 of the ride. Closing until then.`);
  }

  // Instagram token age (tokens last 60 days; regenerating resets the clock)
  const ig = (ctx.status.sources || {}).instagram || {};
  const warnDays = alerts.instagramTokenWarnDays || 45;
  if (ig.token_first_seen_at && ig.state !== "not_connected") {
    const age = now - Date.parse(ig.token_first_seen_at);
    if (age > warnDays * 86400000) {
      await upsert("token instagram", `Instagram token is ${Math.floor(age / 86400000)} days old: regenerate it soon`,
        `Instagram access tokens stop working after 60 days. This one was first seen ${duration(age)} ago.\n\nGenerate a new token in the Meta app (Instagram > API setup > Generate token) and replace the IG_ACCESS_TOKEN secret in the repository settings. The clock resets on the next run.`, "instagram");
    } else await resolve("token instagram", "A new token is in place. Closing.");
  }
}
module.exports = { run };
if (require.main === module) run({ config: C.loadConfig(), status: C.loadStatus() }).then(() => C.saveStatus(C.loadStatus())).catch(e => { console.error(e); process.exit(1); });
