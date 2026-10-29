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
| `http://localhost:4000/?day=306&tinker=1` | The tinker panel (see below) |

The same `?day=306` trick works on the live site (`https://noshortcuts.club/home.html?day=306`), and
`https://noshortcuts.club/test/` is the live test page. Nobody sees these unless they type the address.

Node is installed in your home folder at `~/.local/node`. To uninstall it, delete that folder.

## Changing words, links and sizes

Open `config/site.config.json` in any text editor. Keep the quotes and commas as they are.

- `site.*` name, tagline, description, email.
- `links.*` Spotify, Pocket Casts, Instagram, Substack, the route plan, YouTube.
- `podLink` leave empty for now. When the show is on Apple Podcasts, paste that link here and every
  Listen button switches to it.
- `menu.*` the words in the header.
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

### The tinker panel

With the preview running, open `http://localhost:4000/?day=306&tinker=1`. A panel slides in on the
right: drag the sections into a new order, move the size sliders, edit any sentence or link. The page
updates as you go. **Save to config** writes your changes into `config/site.config.json`. It only
works in the local preview; the published site ignores it.

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
8. Writes the day's **archive** file (`archive/days/NNN.json`), makes a **story image** for any new
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

## Folders

| Folder or file | What it is |
|---|---|
| `site/` | The web pages: `home.html`, `about.html`, `days.html`, `coming-soon.html`, `test/` |
| `site/css/`, `site/js/` | Styling and page logic. `js/trip.js` is the shared trip math (day numbers, totals) |
| `site/data/` | Written by the robot every hour. Do not edit by hand |
| `site/stories/` | Story images made by the robot |
| `config/site.config.json` | The one file to edit |
| `seed/` | The starting copy of the plan, the countries, the route line, the map outlines |
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
