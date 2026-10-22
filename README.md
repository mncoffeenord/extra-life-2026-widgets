# Extra Life 2026 stream widgets

Self-hosted overlay widgets for an [Extra Life](https://www.extra-life.org/) stream. A small local Node.js server
polls the Extra Life (DonorDrive) API on a schedule and caches the results. Transparent widget pages, loaded as
Streamlabs / OBS **Browser Sources**, get live updates from that server.

| Widget | URL path | Size | Shows |
| --- | --- | --- | --- |
| Stream countdown | `/widgets/countdown` | 488 × 82 | `Starts in 2d 04h 12m` → `07:42 of 36:00` (live) → `Overtime 00:12` |
| My Extra Life goal | `/widgets/participant-goal` | 488 × 82 | `$1,250 / $2,000`, %, progress bar |
| Team goal | `/widgets/team-goal` | 488 × 82 | same, for the team |
| Donations received | `/widgets/donation-rotator` | 314 × 58 | Alternates your recent donations and your team's every 45 s. New donations show immediately. |
| Donations received, with messages (optional) | `/widgets/donation-messages` | 314 × 105 | Same, plus the donor's message (2 lines at 13px). Long messages shrink a step, then scroll. The tag line is a footer. |

Why a server instead of widgets calling the API directly (as the 2022 tracker did):

- **One shared poller.** Requests are spaced out, use ETags (unchanged data is a cheap `304`), and back off on errors or rate limits.
- **Last-known-good data.** If the API is down, widgets keep showing the last values, never blank or `NaN`.
  The cache is also saved to disk, so it survives a server restart.
- **One config file and one clock**, so every widget agrees.
- **Tests and a preview page** with fake data, so you can rehearse without real donations.

## Setup

**New here? The [install guide](INSTALL.md) has the short version.**

Requires **Node.js 24+** (developed on 26). No build step: Node runs the TypeScript directly.

```bash
git clone https://github.com/mncoffeenord/extra-life-2026-widgets.git
cd extra-life-2026-widgets
npm install
npm run setup
```

`npm run setup` asks for your participant (checked live), event times, style, Donations version, rotation time, box
titles, and colors, then writes `config.json` (git-ignored), **`MY-SOURCES.md`** (your browser sources with URLs and
sizes), and `start-widgets.command` / `.bat` launchers. Re-run it to change anything. For scripted setups:
`npm run setup -- --defaults --participant 123456 --style framed --theme midnight` (add `--offline` to skip the
check). You can also copy `config.example.json` to `config.json` and edit it by hand. The main settings:

- `extraLife.participantId`: the number at the end of your page URL, e.g. `dd.extra-life.org/participants/123456`.
- `extraLife.teamId`: your team's numeric ID or URL alias, e.g. `dd.extra-life.org/teams/YourTeam` → `"YourTeam"`.
- `event.start` / `event.end`: local wall-clock times in `event.timeZone`, e.g. `"2026-11-12T13:00"`. Use an IANA
  zone name (`America/Chicago`), not a fixed offset, so daylight saving time is handled for you.
- `rotation.intervalSeconds`: how long each donation stays on screen (default 45, so four donations every 3 minutes).
- `messageFilter`: donor messages matching a built-in word list are hidden (the donation still shows). Add words
  with `"extraWords": ["spoiler"]`; turn it off with `"enabled": false`.
- `display.style`: `"framed"` (each widget draws its own box, so it can go anywhere) or `"transparent"` (widgets fill
  boxes drawn in your overlay art). Any source can override it with `?style=framed` / `?style=transparent`.
- `display.donations`: `"standard"` or `"messages"`. This sets which Donations widget `MY-SOURCES.md` and the preview use.
- `display.titles`: header text on framed boxes (`{team}` becomes the team name); `?title=` overrides it per source.
- `theme`: `{ "preset": "extra-life", "colors": { "primary": "#6A1B9A", ... } }`. The preset is a built-in theme
  (`extra-life`, `midnight`, `mono`) or one of yours from `themes/`. Hex overrides for `primary`, `primaryLight`,
  `accent`, `text`, `muted`, `track`, `surface`, `headerText` (see INSTALL.md for what each one colors). The server
  injects the theme into every widget page.

**Themes per source:** add `?theme=<name>` to any widget URL (and single colors, e.g. `&primary=6A1B9A`), so one
server can run light and dark widgets side by side. `npm run theme` turns a pasted color scheme (JSON, CSS variables,
or a list of hex codes) into a named theme in `themes/<name>.json`, checks it for readability, and prints the URLs that
use it. See INSTALL.md, "Colors and themes".

The server checks the config at startup and lists every problem it finds.

## Run

```bash
npm start
```

Then open <http://localhost:4242/preview/> to see every widget on the overlay, with a status panel. Its menus switch
the style, the Donations box and the theme.

To rehearse with fake data (stop the live server first; both use port 4242):

```bash
npm run mock
```

Mock mode adds controls to `/preview`: set totals, send fake donations (named, anonymous, private amount), jump the
clock (before start / live / near end / overtime), and simulate an API outage. Mock mode runs the real poller
against a fake API, so it exercises the same code that runs on stream night.

To see the live clock (`HH:MM of 36:00`) with real data before the event, run against a copy of your config
with an earlier start time, e.g. `"start": "2026-10-21T12:00"` and `"end": "2026-10-23T00:00"`:

```bash
npm start -- --config my-test-window.json
```

Keep your Mac awake during the stream:

```bash
caffeinate -is npm start
```

## Add the widgets in Streamlabs

For each widget: **Add Source → Browser Source**, then:

| Source | URL | Width × Height | Position (X, Y) |
| --- | --- | --- | --- |
| Stream countdown | `http://localhost:4242/widgets/countdown` | 488 × 82 | 23, 987 |
| My Extra Life goal | `http://localhost:4242/widgets/participant-goal` | 488 × 82 | 533, 987 |
| GamePlan42 goal | `http://localhost:4242/widgets/team-goal` | 488 × 82 | 1043, 987 |
| Donations received | `http://localhost:4242/widgets/donation-rotator` | 314 × 58 | 1583, 325 |
| *or* Donations received, with messages | `http://localhost:4242/widgets/donation-messages` | 314 × 105 | 1583, 325 |

These positions put each widget inside the white body of its overlay box, below the blue header and inside the 3px
border, on a 1920 × 1080 canvas. The footer sizes assume the taller footer boxes (494 × 128, bottom at y 1072) from
the 2026-10-21 bottom-bar layer; with the original 116px boxes, use a height of 70. Set the position under **Transform → Edit Transform**, at 100% scale.

Browser Source settings:

- **Local file**: off (use the URL).
- **Custom CSS**: the default (`background-color: rgba(0,0,0,0)…`) is fine; the pages are already transparent.
- **Shutdown source when not visible**: off. The widgets stay connected and keep their place in the rotation.
- **Refresh browser when scene becomes active**: off (optional). The widgets recover on their own.
- If a widget is blank because the server was not running when Streamlabs started it, start the server and click
  **Refresh cache of current page** in the source's properties.

Use **one** of the two Donations sources. The with-messages version needs a taller Donations box in the overlay:
320 × 143 at x 1580, y 290, with the same 32px blue header, which leaves a 314 × 105 white area for the widget. In
`/preview`, the **Donations box** selector shows it in place.

The preview page has the same table with copyable URLs, for the style, Donations box and theme picked in its menus
(a non-default theme adds `?theme=` to each URL). Text and spacing scale with the source **height**
(designed at 82px for the footer, 58px for the rotator). If a box in your overlay gets taller, make the source
taller to match and the widget grows with it. Very large totals in a tall goal box switch to left-aligned amounts
so they never run into the percent.

### Be Right Back scene

`http://localhost:4242/scenes/be-right-back` is a full-screen (1920 × 1080, opaque) scene with the latest donation,
team goal hearts (in halves), your goal bar, and a clock in the header: `DD:HH:MM UNTIL GAME DAY` more than 48 hours
out, `HH:MM UNTIL GAME DAY` closer in, then `HH:MM` counting up from the event start. Half a heart and one bar
segment are always lit; all of them light only at 100%. Add it as a Browser Source at 1920 × 1080, position (0, 0),
on its own scene, FPS 30. Turn **off** "Shutdown source when not visible" so switching scenes doesn't reload it and
flash.

Add `?mock=1` to see it with the design's sample data, `?demo=1` for the same plus a sample donation every 7 seconds,
or `?still=1` to stop the ambient animation.

## Pre-stream checklist

**The day before**

- [ ] `git pull && npm install && npm run check`: tests and type check pass.
- [ ] If you use your own themes: `npm run theme -- --list` lists them and prints no `warning:` lines (a broken theme
      file is skipped).
- [ ] `config.json` has the right participant ID, team ID, start (`2026-11-12T13:00`) and end (`2026-11-14T01:00`).
- [ ] `npm run mock`, open `/preview`: send a fake donation (goal number animates, rotator flashes); try each clock
      preset (Starts in → Live → Overtime); toggle **Simulate outage** (values stay put, status turns red).
- [ ] Stop mock mode.

**An hour before**

- [ ] `caffeinate -is npm start`, and leave that Terminal window open.
- [ ] `/preview` shows **Live data** and **API OK**, and the totals match your Extra Life page.
- [ ] In Streamlabs, all four sources show data. If one is blank, use **Refresh cache of current page**.
- [ ] The countdown shows the right time to start.

**During the stream**

- [ ] If numbers look stuck, check `/preview` (or `http://localhost:4242/api/health`). While the API is failing, the
      widgets keep the last values and catch up automatically once it recovers.

## How it works

```
Extra Life API (dd.extra-life.org/api, pinned ?version=1.6)
        │  one request at a time, ≥2 s apart, ETag/304, backoff on errors / 429
        ▼
   Poller ──► Store (last-known-good, saved to data/cache.json)
                 │
                 ├── GET /api/state, /api/participant, /api/team, /api/donations, /api/countdown, /api/health
                 └── GET /api/stream  (server-sent events: snapshot on connect and on every change)
                          ▼
             /widgets/* pages (Streamlabs browser sources)
```

Polling cadence (configurable): participant every 15 s, team every 30 s. Donation lists are fetched when a total
changes, plus every 2 min as a safety net. Unchanged data costs a `304` with no body. DonorDrive asks integrations
to stay near one request per 15 s and to use ETags.

### API notes (verified 2026-10-21)

- The base URL moved: `www.extra-life.org/api` now redirects to **`dd.extra-life.org/api`**.
- Participant and team IDs are **per event year**; 2022 IDs return 404.
- Top-level lists (`/api/participants`, `/api/teams`) now need credentials (401). Single records and nested lists
  (`/participants/{id}/donations`, `/teams/{id}/donations`) are public.
- Lists return at most 100 records, newest first. Anonymous donors have **no** `displayName` field. A 404 comes back
  as `text/html`, and the rate-limit response is a 401 with the body `Rate limit exceeded.`

## Development

```bash
npm test                 # node:test: config, time zones/DST, parsers, client, poller, rotation, server, themes, setup, message filter
npm run typecheck        # tsc (also checks the browser JS via // @ts-check)
npm run check            # both
npm run dev              # restart on file changes
npm run record-fixtures -- --sample <busy-participant-id>   # re-record anonymized API fixtures
npm run theme -- --list  # list themes; npm run theme makes a new one
```

Project layout:

```
src/                server (TypeScript): config, time zones, API client + parsers, poller, store, HTTP app, mock API,
                    themes, widget geometry, message filter, setup/theme helpers
public/shared/      browser modules shared with the tests: countdown, format, rotation, live (SSE), frame, theme.css
public/widgets/     one folder per widget
public/preview/     preview page
themes/             custom color themes (<name>.json), made by npm run theme
scripts/            setup and theme scripts (interactive), fixture recorder
test/               node:test suites + anonymized fixtures recorded from the live API
local-assets/       git-ignored: put overlay-preview.png (1920x1080) here for /preview
```

See [CLAUDE.md](CLAUDE.md) for conventions and design decisions.

## Roadmap (Phase 2)

- Donation incentives (`/participants/{id}/incentives`) shown with matching donations, plus milestones.
- Offline / starting soon / end scenes as full-canvas pages under `/scenes/` (Be Right Back is built; the others are
  not designed yet).
- Subteam / top participant list (`/teams/{id}/participants`).

## License and credits

GPL-3.0-or-later; see [LICENSE](LICENSE). This project is a rewrite inspired by BozarthPrime's
[Extra Life Tracker](https://github.com/bozarthprime/Extra-Life-Tracker) (GPL-3.0). See [CREDITS.md](CREDITS.md) for
it and for the Inter font (SIL OFL 1.1).

Extra Life is a program of Children's Miracle Network Hospitals. This project is not affiliated with or endorsed by
them. No Extra Life branding or overlay art is included.
