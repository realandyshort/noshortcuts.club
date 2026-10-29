# No Shortcuts website: build brief for Claude Code

Owner: Andy Short. Site: **noshortcuts.club**. A bike trip from Deadhorse, Alaska to Ushuaia, Argentina: 543 days, 18 countries, 6 sections.

Andy is not a coder. Explain what you are doing in plain language, ask before anything that costs money, and never put passwords, tokens or personal body stats in code or in the repo. They go in GitHub Actions secrets.

## 0. Read this first

**What's in this kit**
- `data/route_days_seed.csv`: all 543 planned days (section, day, date, kind, from, to, est_miles, terrain, notes). Kinds: ride, rest, border, boat, excursion. Use it as the starting copy of the route plan and as the fallback if the live sheet can't be read.
- `data/countries.json`: the 18 countries in riding order with the day each is first entered.
- `data/route_line.json`: the whole route as one simplified line of [lat, lon] points in riding order (stylized, not turn-by-turn).
- `assets/mark.svg`: Andy's asterisk mark (a stand-in drawing; he may swap in the original file later).
- `assets/`: podcast cover, Substack logo and banner, for favicons and share images.
- `reference/mockup_home.png` and `reference/mockup_about.png`: the approved page designs. The fonts in these screenshots are stand-ins; use the real fonts in section 10.

**Hard rules**
1. **Never display trip dates** (no calendar dates, no years) anywhere on the site, in share images or in Instagram stories until `showDates` is set to true in the config. Day numbers ("DAY 306") are fine. Dates can exist in data files for internal logic.
2. **Never break visibly.** If a live source fails, its section disappears cleanly until the source works again (section 5).
3. **Everything Andy might want to change lives in one config file** (section 9).
4. Plain HTML, CSS and vanilla JavaScript, plus small Node scripts. No front-end framework. Andy needs to be able to read and tweak it.

## 1. Hosting and automation

- **Hosting:** GitHub Pages on the custom domain noshortcuts.club with HTTPS. The repo will be public (GitHub Pages on the free plan), so nothing private goes in it.
- **DNS:** the domain is registered at GoDaddy, but email forwarding for hello@noshortcuts.club runs through Cloudflare, so DNS is probably managed at Cloudflare. Tell Andy exactly which records to add, and have him give that step to his browser agent (see AGENT_STEPS.md). Never touch the email (MX/routing) records.
- **Automation:** a GitHub Actions workflow runs every hour. It fetches all sources, writes JSON into `site/data/`, saves the daily archive, makes and posts Instagram story images, updates source status and alerts, then commits. Pages redeploys on each commit.
- **Secrets** (GitHub Actions secrets only): `IG_ACCESS_TOKEN`, `IG_USER_ID`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `CAL_WEIGHT_LB`, `CAL_HEIGHT_IN`, `CAL_BIRTHDATE`, `CAL_GEAR_LB`.

Suggested layout:
```
/site            index.html, about.html, coming-soon.html, css/, js/, assets/, data/ (generated)
/config          site.config.json
/scripts         fetch-*.js, build.js, archive.js, story.js, alerts.js, dev-server.js
/seed            route_days_seed.csv, countries.json, route_line.json
/archive/days    001.json ... 543.json (daily snapshots, written by the workflow)
README.md        plain-English guide for Andy
```

## 2. Build in three phases

**Phase 1: coming-soon page (ship first).** Andy's business cards carry a QR code to noshortcuts.club, so this must be live before he prints.
- Full-screen black page (#161412).
- The whole route as one horizontal line (method in section 8): Deadhorse at the left edge, Ushuaia at the right edge, both at the same height, the route bulging between them in persimmon (#E8593D), running edge to edge.
- "No *Short*cuts" with the mark after it (see section 10), "ALASKA TO ARGENTINA" in mono, and small links: Listen (Spotify), Instagram, Substack, hello@noshortcuts.club.
- No dates, no counters. Must look good on phones.

**Phase 2: the full site.** Home and About pages matching the reference screenshots, with live data and graceful failure.

**Phase 3: the interactive layer** (section 8): odometer, counter flips, secret stats, passport stamps, time travel.

After each phase: run it locally, show Andy, then deploy.

## 3. Pages and sections

**Header (both pages):** "Andy *Short.*" wordmark; menu: Map (home), Dispatches (listen link), Pictures (Instagram profile), Route plan (public sheet), About; a "Listen" button. All links come from config.

**Home, in this order (order changeable in config):**
1. **Black banner:** "No *Short*cuts" + mark, info line "ALASKA TO ARGENTINA · DAY 306 OF 543" (no dates), the full-width route line (ridden part persimmon, remaining part gray #8C8681, current position marker with place name), and counters: Days on the road, Countries (12/18), Miles ridden, Ft climbed (with "Everests": 29,032 ft each), Days vs. plan. Small note: "POSITION SHOWN 24 HRS LATE".
2. **Latest photo:** the newest Instagram post, large (16:9 crop), tagged "DAY N · FROM TO TO". Under it: the day's title, the Instagram caption as the route note, chips for planned miles, ridden miles and climb, and a black "NOW" band: current place, local time, weather, and "next up" from the plan.
3. **Map + latest dispatch, side by side, equal size:** the map (Americas outline, ridden route persimmon, planned remainder dotted, position marker) and a black dispatch panel (newest dispatch with player, earlier entries listed with play buttons, "Listen in your podcast app" link).
4. **The days:** the last 5 days as cards: photo (that day's Instagram post), DAY N, From to To, PLAN x MI, RODE x MI, CLIMB x FT. Link to all 543 days.
5. **Videos (off by default):** one big YouTube player for the newest video in the No Shortcuts playlist, title above. Shows only when `sections.videos.enabled` is true and the feed works.
6. **Footer "Follow along":** buttons Listen in your podcast app / Watch on YouTube (only when videos enabled) / Instagram; "Prefer email? Subscribe on Substack"; "Say hi: hello@noshortcuts.club".

**About:** large portrait placeholder + "Hi, I'm Andy *Short.*" + bio text from config; black "Why I'm doing this" band with a quote and paragraph from config; same footer. Copy comes from config (Andy will write it).

## 4. Data sources

| Source | Where | Used for | If it fails |
|---|---|---|---|
| Route plan | Public view-only Google Sheet `1qAlzQWOvfifr_0LJ1YUm8b1mv0ewg51yYJVj1JHcOyo`, read as CSV per tab (`https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<tab>`). List the tabs first; normalize to the seed schema. | Day numbers, places, planned miles and climbing, notes, all derived stats | Keep the last good copy; never hide plan-based content |
| Dispatches | RSS `https://anchor.fm/s/11951c6c8/podcast/rss` | Dispatch player and list, story automation | Hide dispatch panel |
| Instagram | Instagram Graph API, Business account @wicked.short (`IG_ACCESS_TOKEN`, `IG_USER_ID`). Refresh the long-lived token automatically well before it expires. | Latest photo, captions, day-card photos, story publishing | Hide photo sections and day-card photos |
| Videos | YouTube playlist RSS `https://www.youtube.com/feeds/videos.xml?playlist_id=PLdutpqTR1PWY` | Video section (toggle) | Hide video section |
| Rides | Strava API, athlete 10011807 (OAuth refresh-token flow). Garmin auto-syncs to Strava. | Ridden miles, climb, moving time, highest point, per-day matching by local date | Fall back to plan numbers; keep sections visible |
| Position | Garmin MapShare public KML feed for `G26HK76N9Z` (page: https://share.garmin.com/G26HK76N9Z) | Position marker, place, local time, weather lookup | Hide marker, NOW band and "days vs plan" |
| Weather | Any free no-key weather API (for example Open-Meteo) at the delayed position | NOW band | Hide weather text only |

Links (all in config): Spotify show `https://open.spotify.com/show/4hV5UdSqhmQpzcv4tShkrY`; Substack `https://noshortcutsclub.substack.com`; public route plan `https://docs.google.com/spreadsheets/d/1qAlzQWOvfifr_0LJ1YUm8b1mv0ewg51yYJVj1JHcOyo/edit`; Instagram `https://www.instagram.com/wicked.short/`; YouTube playlist `https://www.youtube.com/playlist?list=PLdutpqTR1PWY`; Pocket Casts `https://pca.st/kdvoa4ii`. A `podLink` field starts empty; when Andy fills it in (after Apple lists the show), every "Listen" link switches to it automatically.

**Position privacy:** only ever show positions that are at least 24 hours old.

## 5. Graceful failure and email alerts

- Each source records in `site/data/status.json`: `last_success_at`, `last_new_item_at`, `consecutive_failures`, `last_error`.
- A source counts as **broken** after 2 failed hourly runs in a row (so one blip doesn't flicker the page). When broken, its sections render nothing at all: no empty boxes, no error text, no layout gaps. They come back on their own after the next good run.
- **Alerts by email, with no extra accounts:** when a source becomes broken, the workflow opens a GitHub Issue titled like "Instagram sync broken: no successful update for 1 day 4 hours". It updates the title and adds a comment once a day with the current duration, and closes the issue when the source recovers. GitHub emails issue activity to the account email (hello@noshortcuts.club, which forwards to Andy).
- Also alert, as a separate issue, if a source works but has had nothing new for longer than a config threshold (defaults: dispatches 7 days, Instagram 3 days, Strava 4 days, position 2 days). Make it clear this is "nothing new" rather than "broken".

## 6. Instagram story automation

- When the dispatch RSS has an item that hasn't been posted yet (track posted item IDs in a data file), make a 1080×1920 story image: black background, the full route line with the ridden part in persimmon, "NEW DISPATCH", "Day N: Place" in Petrona with the place in persimmon italic, the mark, and "noshortcuts.club". No dates.
- Commit the image to the site so it has a public URL, then publish it as a story with the Instagram Graph API (create a media container with `media_type=STORIES` and the `image_url`, then publish it). Stories publishing requires a Business account; @wicked.short is now Business.
- If the API can't add a link sticker, keep the address on the image. All dispatches are audio, and every new one gets a story.
- Never post the same dispatch twice. Have a dry-run switch in config.

## 7. Day logic, archive and test mode

- **Today's day number:** days since the plan's day 1 date, plus 1. Before day 1, serve the coming-soon page. Never show the dates themselves.
- **Daily archive:** once per day, write `archive/days/NNN.json` with that day's Instagram posts (image URLs and permalinks), captions, dispatches (titles, audio URLs, links), Strava stats, delayed position, and running totals. Time travel reads these files.
- **Test mode:** a hidden `/test/` page, or `?day=NNN` on any page, simulates being on any day using plan data, while still pulling the **current** Instagram posts and dispatch feed. Show a small status strip for each source in test mode only. This is how Andy previews the site before the trip.

## 8. Interactions and formulas (phase 3)

**Route line in the banner:** project points as x = (lon + 150) × cos(25°), y = 72 − lat. Rotate so the first point (Deadhorse) and the last point (Ushuaia) sit at the same height, Deadhorse on the left. Scale so they touch the left and right edges, and extend short straight tails past both edges. The route bulges upward between them. Use the full detail of `route_line.json`.

**Mapping days to the line:** a day's position is the cumulative planned miles at the end of that day divided by total planned miles, measured along the line.

**Odometer:** counters roll up when the page loads.

**Click a counter to flip the banner.** The clicked counter highlights; click again or press Escape to return.
- **Days:** the banner becomes a grid of 543 small squares, one per day; days done are filled persimmon.
- **Countries:** outlines of the countries entered so far fade in over the line (Natural Earth 1:50m, filtered to the 18 countries).
- **Ft climbed:** the line morphs into the elevation profile of the whole route. Get elevations for `route_line.json` points once from a free elevation API, cache them, and draw the profile left to right on the same day-to-position mapping.
- **Days vs. plan:** no trigger.

**Click the mark: secret stats.** The banner flips to tallies, each with a small line icon in the brand style. All are worked out from the plan, nothing for Andy to update, and they stop at the current or time-travelled day:
- **Water:** 5 liters × days on the road
- **Hot springs:** days whose notes or places match keywords (hot spring, springs, thermal, termas, termales, Tolantongo, Fuentes Georginas, Puertecitos, Coconuco, Baños del Inca, Monterrey, Puyuhuapi, Daymán), editable in config, with a manual include/exclude list
- **Border crossings:** border days, plus days 9, 44, 82 and 222 (editable list)
- **Boat crossings:** days whose notes mention ferry or boat, plus kind boat
- **Rest days:** kind rest
- **Capitals visited:** a config list of capital city names matched to places
- **Calories burned** (formula below)

**Calories, from the plan only, no heart rate.** Body stats come from secrets; only the totals are published.
- Resting calories per day (Mifflin-St Jeor): 10 × weight_kg + 6.25 × height_cm − 5 × age + 5. Age comes from `CAL_BIRTHDATE` on each day, so birthdays update it.
- Riding calories: miles × 32 + feet_climbed × 0.41. These constants assume a loaded bike plus gear of `CAL_GEAR_LB` (66 lb by default) and about 11 mph; make them config values.
- Rest days: resting calories × 1.4. Ride days: resting + riding.
- Use planned miles and climbing for each day.

**Passport stamps:** a section with 18 stamps in the brand style (country name in mono, "DAY N" of first entry), faded until entered. Tapping a stamp shows the first archived photo from that country.

**Time travel:** dragging or scrubbing along the banner line or the map moves a marker. The page shows that day's archived content (photo, caption, dispatches, each linking to the original post), and every counter and secret stat shows totals as of that day. A "Back to today" button returns. On touch screens, dragging must not scroll the page. Days without an archive show plan-only content.

## 9. Easy tinkering for Andy

- **`config/site.config.json`** holds all copy (titles, bio, quote, button labels), all links, section order, section on/off switches (`videos` off by default), sizes (banner height, title size, photo height, map size, card count), alert thresholds, keyword lists, capitals list, calorie constants, `showDates` (false), `podLink` (empty) and the story dry-run switch.
- **`npm run dev`** starts a local preview with live reload.
- **Tinker panel** (local preview only, `?tinker=1`): drag sections to reorder them, sliders for the main sizes, text boxes for copy and links. A Save button writes `site.config.json` through the dev server. Production ignores it.
- **README.md** in plain English: how to preview, how to change copy, links and sizes, how to turn videos on, how to publish (commit and push), and what each alert email means.

## 10. Brand

- **Colors:** ink #161412, cream #FBE9D7, persimmon #E8593D, peach #F4C8AB, gray route remainder #8C8681, cobalt #2D4EE8 (rarely).
- **Fonts (Google Fonts):** Petrona (headlines; italic for emphasis), Bricolage Grotesque (body), JetBrains Mono (numbers, labels, day counts).
- **Title treatment:** "No *Short*cuts" with "Short" in persimmon italic, followed by the mark in persimmon, raised like an asterisk and sized to about 0.42 em. Never a typed asterisk.
- **Rules:** generous spacing; text on photos always sits on a solid chip; no stock-looking gradients; accessible contrast; responsive down to phone width; respect reduced-motion settings for the odometer and flips.

## 11. Acceptance checklist

- [ ] Coming-soon page live at https://noshortcuts.club, good on a phone, no dates
- [ ] Home and About match the reference designs; every link comes from config
- [ ] Turning off the network for any one source hides only that source's sections; the rest still look complete
- [ ] A broken source opens a GitHub Issue with the outage duration, updates daily, closes on recovery
- [ ] New dispatch → story image made and posted once (verified with dry-run first)
- [ ] `?day=NNN` and `/test/` simulate any day, using current Instagram and dispatch feeds
- [ ] Tinker panel saves config changes locally
- [ ] No dates anywhere while `showDates` is false
- [ ] No secrets or body stats in the repo

## 12. Notes added during the build

- **GitHub username is `realandyshort`** (not noshortcutsclub). The www DNS record points at `realandyshort.github.io`.
- **Route plan sheet, missing tabs (added 2026-10-28):** the "Segment 6" tab is not in the public route plan sheet yet. For any tab or days missing from the sheet, use `seed/route_days_seed.csv` for those days, and switch to the sheet automatically once the tab appears. Never leave a gap in the 543 days.
- **Phase 1 layout:** `site/index.html` *is* the coming-soon page for now. In Phase 2, move it to `site/coming-soon.html` and let `index.html` become the home page (served as coming-soon before day 1, per section 7).
- **Publishing:** GitHub Pages deploys from the `Deploy to GitHub Pages` workflow (source: GitHub Actions, not a branch folder). It bundles `site/` plus `config/site.config.json` and the seed JSON into one folder. The Phase 2 hourly workflow should write into `site/data/` and commit; this deploy workflow then runs on that commit.
- **Node is not installed on Andy's Mac** (no Homebrew either). Phase 1 uses a Python preview server. Phase 2 needs Node for the scripts and the dev server; install it then.
