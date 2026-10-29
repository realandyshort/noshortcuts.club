# No Shortcuts website

The site behind **noshortcuts.club**: a bike trip from Deadhorse, Alaska to Ushuaia, Argentina. 543 days, 18 countries, 6 sections.

This is a plain website: HTML, CSS and a little JavaScript. No frameworks. Everything you are likely to change lives in one file, `config/site.config.json`.

**Right now the site is the Phase 1 coming-soon page.** Phase 2 (the full home and About pages) and Phase 3 (the interactive layer) come later; see `BUILD_BRIEF.md`.

## What is where

| Folder or file | What it is |
|---|---|
| `site/` | The website itself. `site/index.html` is the page people see. |
| `site/css/` | How things look: colours, fonts, spacing. |
| `site/js/` | Small scripts: one draws the route line, one fills in the links from the config. |
| `site/assets/` | The mark, icons and the share image. |
| `config/site.config.json` | **The one file to edit** for wording, links and sizes. |
| `seed/` | The route plan: all 543 days, the 18 countries, and the route as a line of map points. |
| `scripts/dev-server.py` | Runs a local preview on your Mac. |
| `.github/workflows/deploy.yml` | The robot that publishes the site whenever a change is pushed. |
| `BUILD_BRIEF.md`, `reference/` | The plan and the approved page designs. |

## Preview the site on your Mac

In Terminal, from this folder:

```
python3 scripts/dev-server.py
```

Then open http://localhost:4000 in your browser. Press Ctrl+C in Terminal to stop it. (Opening `index.html` by double-clicking does not work; the page needs the little server to read the config.)

## Change wording, links or sizes

Open `config/site.config.json` in any text editor and change the text between the quotes. Keep the quotes and commas as they are.

- `site.tagline`: the small line under the title ("ALASKA TO ARGENTINA").
- `site.email`: the email shown on the page.
- `links.*`: Spotify, Instagram, Substack, the route plan, YouTube, Pocket Casts.
- `podLink`: leave empty for now. Once Apple lists the show, paste the link here and every "Listen" link switches to it.
- `labels.*`: the words on the small links.
- `comingSoon.titleSize`: how big "No Shortcuts" is.
- `comingSoon.routeStrokePx`: how thick the route line is.
- `comingSoon.drawOnLoad`: `true` draws the line in when the page opens; `false` shows it instantly.
- `showDates`: **leave this `false`** until you decide to show trip dates. Nothing on the site shows a date while it is false.

Save, then refresh the preview to check it.

## Publish a change

The site is published by GitHub Pages. Pushing to the `main` branch publishes it; the robot in `.github/workflows/deploy.yml` takes a minute or two.

In Terminal, from this folder:

```
git add -A
git commit -m "Describe what you changed"
git push
```

You can watch it publish under the **Actions** tab of the GitHub repository. If the robot fails, GitHub emails hello@noshortcuts.club.

## Rules the site follows

- No trip dates anywhere while `showDates` is false. Day numbers ("DAY 306") are fine.
- If something cannot load, that part quietly disappears. The page never shows an error.
- No passwords, tokens or personal body stats in this repository. They go in GitHub Actions secrets (Settings > Secrets and variables > Actions).

## What the alert emails will mean (Phase 2)

Once the hourly data robot exists, GitHub will open an Issue (and email you) when a source such as Instagram or Strava stops working, update it daily with how long it has been down, and close it when things recover. A separate Issue warns when a source works but has had nothing new for a while. Not built yet.
