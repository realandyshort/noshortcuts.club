# noshortcuts.club

The website for No Shortcuts: Andy's 543-day bike ride from Deadhorse, Alaska to Ushuaia, Argentina.
This file explains, in plain English, how the site works and how to change it. You do not need to
be a coder to use it.

## The short version

- **The site is plain web pages** in the `site/` folder. GitHub publishes them at https://noshortcuts.club
  every time a change is pushed.
- **A robot runs once an hour** on GitHub (nothing on your computer). It reads the route plan, the
  podcast feed, Instagram, Intervals.icu (rides), the Garmin tracker and the weather, writes what it
  found into `site/data/`, and publishes. If a source stops working, its part of the page disappears
  cleanly and you get an email.
- **Everything you might want to change is in one file:** `config/site.config.json`.
- **Before day 1 of the plan, visitors see the coming-soon page.** From day 1 they see the home page.
  This switches by itself.

## Preview on your Mac

Open Terminal, go to the project folder and run:

```bash
cd ~/Projects/noshortcuts && ~/.local/node/bin/npm run dev
```

Then open http://localhost:4000 in a browser. The page reloads itself whenever you save a file.

Useful addresses while previewing:

| Address | What it shows |
|---|---|
| `http://localhost:4000/` | What visitors see right now (coming-soon before day 1) |
| `http://localhost:4000/?day=306` | The home page as if it were day 306 |
| `http://localhost:4000/test/` | A page with a day slider and the state of every source |
| `http://localhost:4000/?day=306&edit=1` | Edit mode (see below) |

The same `?day=306` trick works on the live site (`https://noshortcuts.club/home.html?day=306`), and
`https://noshortcuts.club/test/` is the live test page. Nobody sees these unless they type the address.

Node is installed in your home folder at `~/.local/node`. To uninstall it, delete that folder.

## Changing words, links and sizes

Open `config/site.config.json` in any text editor. Keep the quotes and commas as they are.

- `site.*` name, tagline, description, email.
- `links.*` Spotify, Pocket Casts, Instagram, Substack, the route plan, YouTube.
- `podLink` leave empty for now. When the show is on Apple Podcasts, paste that link here and every
  Listen button switches to it.
- `menu.*` the words in the header (Map, Route plan, About, and the Subscribe button).
- `signup.mode` how the email fields hand people to Substack: `subscribe` opens Substack's subscribe page with the address filled in; `direct` posts it straight to Substack's free-signup endpoint. `copy.signup.*` is the wording of the strip and the footer field.
- `labels.*` the words on the coming-soon buttons (Listen, See, Consider, About).
- `comingSoon.note` the small line on the coming-soon page; `comingSoon.aboutText` what the About
  button shows when hovered (empty hides the button).
- `copy.*` all the sentences on the pages: the About page (`copy.about.bio`, `copy.about.quote`,
  `copy.about.why`), the footer, the dispatch panel, the placeholders.
- `copy.about.portraitSrc` the address of your portrait photo once you have one (put the file in
  `site/assets/` and write `assets/portrait.jpg`).
- `home.sectionOrder` the order of the home-page sections. `home.dayCards` how many day cards.
  `home.bannerHeight`, `home.titleSize`, `home.photoHeight`, `home.mapHeight` the main sizes.
- `sections.videos.enabled` set to `true` to turn the video section on.
- `showDates` must stay `false` until you decide otherwise. While it is false, no calendar date or
  year appears anywhere, and anything that looks like one is scrubbed from captions and notes.
- `alerts.*` when the robot should email you (see below). `stories.*` story posting (see below).
- `secretStats.*` keyword lists and calorie constants for the phase 3 "secret stats".

### Edit mode: change the site in the browser

Open any page with `?edit=1` on the end, for example `https://noshortcuts.club/about.html?edit=1`
(or `http://localhost:4000/about.html?edit=1` in the local preview).

- **Click any wording on the page and type.** Titles, bio, quote, button labels, menu words: anything
  that comes from the config gets a dashed outline and is editable in place.
- **The panel on the right** has the rest: drag the home-page sections into a new order, switches
  (videos on or off, counters rolling, time travel), size sliders, every link, and the About portrait
  upload (the photo is shrunk to 1600px and saved as `site/assets/portrait.jpg`).
- **Save** publishes. **Done** leaves edit mode.

**Saving from the live site needs a key, once.** GitHub only lets the site write to itself with your
permission. The panel's Saving section walks you through making one (two minutes): a fine-grained
personal access token named "No Shortcuts edit", limited to the noshortcuts.club repository, with
Contents: Read and write. Paste it into the panel and it stays in that browser only, never in any file.
Afterwards a small Edit button appears in the corner of every page in that browser. "Forget the key"
removes it. If you ever suspect the key leaked, delete it at github.com/settings/tokens and make a new one.

In the local preview no key is needed: Save writes straight into `config/site.config.json`.

## Publishing a change

```bash
cd ~/Projects/noshortcuts && git add -A && git commit -m "Describe the change" && git push
```

About a minute later the change is live. (Your browser agent can do this too.)

## What the robot does every hour

1. **Route plan**: reads every "Segment N" tab of the public Google Sheet. A tab that does not exist
   yet (Segment 6 today) comes from `seed/route_days_seed.csv` and switches to the sheet the moment
   the tab appears. The 543 days are never incomplete.
2. **Dispatches**: the podcast RSS feed.
3. **Instagram**: newest posts, only when the `IG_ACCESS_TOKEN` and `IG_USER_ID` secrets exist.
   Until then the photo spots show brand placeholders with a link to Instagram.
4. **Videos**: the YouTube playlist, only when videos are turned on in config.
5. **Rides**: Intervals.icu, only when the `INTERVALS_API_KEY` and `INTERVALS_ATHLETE_ID` secrets
   exist. Until then the counters show plan numbers and say so ("MILES · PLAN").
6. **Position**: the Garmin MapShare feed. Only a position at least 24 hours old is ever shown.
7. **Weather** at that position, from Open-Meteo.
8. **Live geography**: for new rides, fetches the GPS track from Intervals.icu and records national
   parks entered and the highest altitude (`site/data/geo_live.json`). **Daily weather**: the high and
   low where each day ended, from Open-Meteo's archive, a few dozen days per run (`day_weather.json`).
   Both keep earlier results if a lookup fails.
9. Writes the day's **archive** file (`archive/days/NNN.json`), makes a **story image** for any new
   dispatch, updates **alerts**, commits, publishes.

Secrets live in GitHub: repository > Settings > Secrets and variables > Actions. Never in files.

Run it by hand: GitHub > Actions > "Hourly update" > Run workflow. Or locally (no alerts, nothing posted):

```bash
cd ~/Projects/noshortcuts && ~/.local/node/bin/node scripts/update.js --no-alerts
```

## Alert emails

GitHub emails hello@noshortcuts.club whenever the robot opens, updates or closes an Issue. Three kinds:

- **"X sync broken: no successful update for 1 day 4 hours"**: the source has failed two hourly runs
  in a row. Its sections are hidden until it recovers. The issue body says what to check. It updates
  once a day and closes itself when the source works again.
- **"X: nothing new for 8 days (not broken)"**: the source works but nothing new has arrived for
  longer than `alerts.nothingNewDays` in config. A nudge, not an outage.
- **"Instagram token is 46 days old: regenerate it soon"**: Instagram tokens stop working after 60
  days. Generate a new one in the Meta app and replace the `IG_ACCESS_TOKEN` secret.

A source that is simply not connected yet (Instagram, rides) never raises an alert.

## Instagram stories

For every new dispatch the robot makes a 1080x1920 story image (saved under `site/stories/`, so you
can look at them) and, when live, posts it as a story. Two safety switches:

- `stories.dryRun` is `true` to start: images are made, nothing is posted. Set it to `false` once
  Instagram is connected and you have looked at a few images.
- Only a dispatch that was new while live gets posted (within `stories.postWithinHours`, 48 by
  default), so flipping the switch never posts a backlog of old dispatches.

## The interactive layer (phase 3)

- **Counters roll up** when the page opens (off for people who asked their device for less motion).
- **Click a counter** and the banner flips: *Days* becomes one small square per day, *Countries*
  draws the outlines of the countries entered so far over the line, *Ft climbed* turns the line into
  the elevation profile of the whole route. Click again, or press Escape, to come back.
- **Click the mark** after "No Shortcuts" for the secret stats: water, hot springs, volcanoes climbed,
  waters dipped in, border and boat crossings, rest days, capitals, calories. All worked out from the
  plan. The keyword lists, the distance rules (`volcanoMiles`, `waterMiles`) and the calorie constants
  are in `secretStats` in the config. Volcanoes and waters use each day's start and end place: a
  Smithsonian-listed volcano within 2 miles counts as climbed, a sea or lake within a quarter mile
  counts as dipped in (hover a tile to see the names). Also: national parks entered (OpenStreetMap
  park boundaries along the route; a park counts once, the first time a day's track enters it), llamas
  seen (`llamasPerHighDay`, 20, for every Andean day above `highAltitudeM`, 3,500 m), pedal strokes
  (moving time times the Garmin's cadence, or `cadenceRpm`, 75, when it has none; planned days use
  `planSpeedMph`), and chains worn out (miles divided by `chainMiles`, 3,000). A **Milestones** row
  shows the highest point reached, and the hottest and coldest day (daily high and low from
  Open-Meteo's weather archive at where the day ended). Until the ride starts these use the plan's
  Komoot tracks and the weather from the same dates two years earlier, marked ESTIMATE; once a day is
  ridden, the real ride replaces the plan for that day. Calories use the Garmin's own figure for a day
  when it sent one, otherwise the estimate; they only appear once the four `CAL_*` secrets exist in
  GitHub, and the body stats themselves never leave the robot.
- **Time travel:** drag along the banner line (or the map) and the whole page shows that day, with
  the archived photo, caption and dispatches when there is an archive for it, and the plan otherwise.
  "Back to today" returns. The address updates (`?day=NNN`) so a day can be shared.
- **Passport:** one stamp per country, inked from the day the ride crosses in. Tap a stamp for the
  first photo from that country.
- Switches: `home.odometer` and `home.timeTravel` in the config.

## Folders

| Folder or file | What it is |
|---|---|
| `site/` | The web pages: `home.html`, `about.html`, `days.html`, `coming-soon.html`, `test/` |
| `site/css/`, `site/js/` | Styling and page logic. `js/trip.js` is the shared trip math (day numbers, totals) |
| `site/data/` | Written by the robot every hour. Do not edit by hand |
| `site/stories/` | Story images made by the robot |
| `config/site.config.json` | The one file to edit |
| `seed/` | The starting copy of the plan, the countries, the route line, the map outlines, country outlines, elevations, place coordinates and per-day geography (`scripts/geo-places.js`, `scripts/geo-stats.py`, run by hand) |
| `archive/days/` | One file per trip day, written by the robot |
| `scripts/` | The robot (`update.js` runs everything), the dev server, `format-route-plan.gs` (sheet styling) |
| `assets/fonts/` | Brand fonts (open licence) used for story images |
| `.github/workflows/` | `deploy.yml` publishes; `hourly.yml` is the robot |
| `BUILD_BRIEF.md` | The original build brief, with notes added during the build |

## Rules the site follows

- No trip dates anywhere until `showDates` is true. Day numbers are fine.
- Never break visibly: a failing source hides its own sections, nothing else.
- Positions are shown at least 24 hours late.
- No passwords, tokens or personal body stats in the repository. They go in GitHub Actions secrets.
