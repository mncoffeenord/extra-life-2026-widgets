# Extra Life 2026 stream widgets

Self-hosted overlay widgets for an [Extra Life](https://www.extra-life.org/) stream. A small local Node.js server
polls the Extra Life (DonorDrive) API on a schedule and caches the results. Transparent widget pages, loaded as
Streamlabs / OBS **Browser Sources**, get live updates from that server.

| Widget | URL path | Size | Shows |
| --- | --- | --- | --- |
| Stream countdown | `/widgets/countdown` | 488 × 70 | `Starts in 2d 04h 12m` → `Live 07:42 of 36:00` → `Overtime 00:12` |
| My Extra Life goal | `/widgets/participant-goal` | 488 × 70 | `$1,250 / $2,000`, %, progress bar |
| Team goal | `/widgets/team-goal` | 488 × 70 | same, for the team |
| Donations received | `/widgets/donation-rotator` | 314 × 58 | Alternates your recent donations and your team's every 30 s. New donations show immediately. |

Why a server instead of widgets calling the API directly (as the 2022 tracker did):

- **One shared poller.** Requests are spaced out, use ETags (unchanged data is a cheap `304`), and back off on errors or rate limits.
- **Last-known-good data.** If the API is down, widgets keep showing the last values, never blank or `NaN`.
  The cache is also saved to disk, so it survives a server restart.
- **One config file and one clock**, so every widget agrees.
- **Tests and a preview page** with fake data, so you can rehearse without real donations.

## Setup

Requires **Node.js 24+** (developed on 26). No build step: Node runs the TypeScript directly.

```bash
git clone https://github.com/mncoffeenord/extra-life-2026-widgets.git
cd extra-life-2026-widgets
npm install
cp config.example.json config.json
```

Edit `config.json` (it is git-ignored):

- `extraLife.participantId`: the number at the end of your page URL, e.g. `dd.extra-life.org/participants/123456`.
- `extraLife.teamId`: your team's numeric ID or URL alias, e.g. `dd.extra-life.org/teams/YourTeam` → `"YourTeam"`.
- `event.start` / `event.end`: local wall-clock times in `event.timeZone`, e.g. `"2026-11-12T13:00"`. Use an IANA
  zone name (`America/Chicago`), not a fixed offset, so daylight saving time is handled for you.
- `rotation.intervalSeconds`: how long each donation stays on screen (default 30).

The server checks the config at startup and lists every problem it finds.

## Run

```bash
npm start
```

Then open <http://localhost:4242/preview/> to see every widget on the overlay, with a status panel.

To rehearse with fake data (stop the live server first; both use port 4242):

```bash
npm run mock
```

Mock mode adds controls to `/preview`: set totals, send fake donations (named, anonymous, private amount), jump the
clock (before start / live / near end / overtime), and simulate an API outage. Mock mode runs the real poller
against a fake API, so it exercises the same code that runs on stream night.

To see the live clock (`Live HH:MM of 36:00`) with real data before the event, run against a copy of your config
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
| Stream countdown | `http://localhost:4242/widgets/countdown` | 488 × 70 | 23, 987 |
| My Extra Life goal | `http://localhost:4242/widgets/participant-goal` | 488 × 70 | 533, 987 |
| GamePlan42 goal | `http://localhost:4242/widgets/team-goal` | 488 × 70 | 1043, 987 |
| Donations received | `http://localhost:4242/widgets/donation-rotator` | 314 × 58 | 1583, 59 |

These positions put each widget inside the white body of its overlay box, below the blue header and inside the 3px
border, on a 1920 × 1080 canvas. Set the position under **Transform → Edit Transform**, at 100% scale.

Browser Source settings:

- **Local file**: off (use the URL).
- **Custom CSS**: the default (`background-color: rgba(0,0,0,0)…`) is fine; the pages are already transparent.
- **Shutdown source when not visible**: off. The widgets stay connected and keep their place in the rotation.
- **Refresh browser when scene becomes active**: off (optional). The widgets recover on their own.
- If a widget is blank because the server was not running when Streamlabs started it, start the server and click
  **Refresh cache of current page** in the source's properties.

The preview page has the same table with copyable URLs. Text and spacing scale with the source **height**
(designed at 70px for the footer, 58px for the rotator). If a box in your overlay gets taller, make the source
taller to match and the widget grows with it. Very large totals in a tall goal box switch to left-aligned amounts
so they never run into the percent.

## Pre-stream checklist

**The day before**

- [ ] `git pull && npm install && npm run check`: tests and type check pass.
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
npm test                 # node:test: config, time zones/DST, parsers, client, poller, rotation, server
npm run typecheck        # tsc (also checks the browser JS via // @ts-check)
npm run check            # both
npm run dev              # restart on file changes
npm run record-fixtures -- --sample <busy-participant-id>   # re-record anonymized API fixtures
```

Project layout:

```
src/                server (TypeScript): config, time zones, API client + parsers, poller, store, HTTP app, mock API
public/shared/      browser modules shared with the tests: countdown, format, rotation, live (SSE), theme
public/widgets/     one folder per widget
public/preview/     preview page
test/               node:test suites + anonymized fixtures recorded from the live API
local-assets/       git-ignored: put overlay-preview.png (1920x1080) here for /preview
```

See [CLAUDE.md](CLAUDE.md) for conventions and design decisions.

## Roadmap (Phase 2)

- Donation incentives (`/participants/{id}/incentives`) shown with matching donations, plus milestones.
- Offline / starting soon / BRB / end scenes as full-canvas pages under `/scenes/`.
- Subteam / top participant list (`/teams/{id}/participants`).

## License and credits

GPL-3.0-or-later; see [LICENSE](LICENSE). This project is a rewrite inspired by BozarthPrime's
[Extra Life Tracker](https://github.com/bozarthprime/Extra-Life-Tracker) (GPL-3.0). See [CREDITS.md](CREDITS.md) for
it and for the Inter font (SIL OFL 1.1).

Extra Life is a program of Children's Miracle Network Hospitals. This project is not affiliated with or endorsed by
them. No Extra Life branding or overlay art is included.
