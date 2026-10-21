# CLAUDE.md

Extra Life 2026 stream overlay widgets: a local Node server that polls the DonorDrive API and serves transparent widget
pages to Streamlabs (macOS) as Browser Sources. Owner streams for team GamePlan42. The event is Nov 12–13, 2026
(stream from 1 PM Thu Nov 12 to 1 AM Sat Nov 14, US Central).

## Commands

- `npm start`: live server on `http://localhost:4242` (preview at `/preview/`, widgets at `/widgets/<name>`)
- `npm run mock`: fake API plus preview controls (totals, donations, clock presets, outage)
- `npm run check`: type check and tests. Run it before every commit.
- `npm run record-fixtures -- --sample <busy participant id>`: re-record anonymized fixtures

## Conventions

- **No build step.** Node 24+ runs `.ts` directly (type stripping). Use only erasable TypeScript: no enums,
  no parameter properties, no namespaces. Import with explicit `.ts` extensions. `tsc` is type-check only (`noEmit`).
- **No runtime JS dependencies.** Use `node:http`, built-in `fetch`, and `Intl`. The only dependency is
  `@fontsource-variable/inter`, for the font files.
- **Browser code is plain ES modules** in `public/`, with `// @ts-check` and JSDoc types, so tsc checks it and
  Node tests import it directly. Use **relative** imports in browser code (tsc cannot resolve `/shared/...`).
- Pure logic shared by browser and tests lives in `public/shared/` (countdown, format, rotation). Keep DOM code out.
- **Untrusted text** (donor names, messages) goes in through `textContent` only. Never use `innerHTML`.
- Widgets must render something sensible with no data, stale data, or a missing goal. Never show blank or `NaN`.
  Treat repeated snapshots as no-ops.
- Tabs for indentation (see `.editorconfig`). Small commits with a clear "why" in the body.
- The source table (name, URL, x, y, w, h) appears in both `public/preview/preview.js` (`SOURCES`) and README.md.
  Keep them in sync.

## Never commit

- `config.json` (real IDs), `data/` (runtime cache), `local-assets/*` (overlay art with CMN branding), `scripts/raw/`
  (un-anonymized API recordings).
- Real names or personal data in fixtures. `scripts/record-fixtures.ts` scrubs names, donor IDs, messages and
  avatars, and remaps IDs. Check the output before committing new fixtures.
- The Bensound track from the 2022 tracker: its license covers use, not redistribution. Discuss before adding any audio.

## Design decisions (2026-10-21)

- **Local server, not direct browser calls.** One poller, ETag/304, backoff with jitter, Retry-After, and a minimum
  2 s gap between requests. Last-known-good values stay in memory and in `data/cache.json`, keyed by
  participant/team so a stale cache from other IDs is ignored.
- **Polling:** participant 15 s, team 30 s. Donation lists are fetched when a total or `numDonations` changes, plus a
  120 s safety poll. The API is pinned to `?version=1.6` (the API defaults to 1.0).
- **Push via SSE** (`/api/stream`), with polling fallback (`?transport=poll`). Browsers allow about 6 HTTP/1.1
  connections per origin, and each widget holds one. `/preview` polls `/api/health` instead of streaming, to leave
  room. If Phase 2 adds more than about 5 widgets to one browser context, multiplex them (e.g. a SharedWorker) or
  use `?transport=poll`.
- **Clock:** the event start/end in config are wall times in an IANA zone (`America/Chicago`) and are converted with
  `Intl`. Never use fixed offsets: the 2022 config's `-05:00` would be an hour off after DST ends on Nov 1, 2026.
  Widgets tick locally using the server's clock offset, so mock time travel works too.
- **Countdown phases** (owner's spec): before start, `Starts in` with `Xd HHh MMm` (24 h or more) or `HH:MM:SS`;
  during, `HH:MM of 36:00` with no label (anyone seeing the overlay knows it is live; elapsed, counting up); after the end, `Overtime HH:MM` (counting up, no done message).
- **Scalable sizing (2026-10-21):** widget CSS uses design pixels, `calc(N * var(--u))`, where
  `--u = 100vh / --design-h` (82 for footer widgets, 58 for the rotator). Size changes only need the Streamlabs
  source height to change. Don't write raw `px` sizes in widget CSS.
- **Type scale and color (owner's spec):** the countdown time is 38u, larger on purpose. Goal raised amounts are 32u, target text 22u, percent 20u, pills 13u. In all three footer widgets, the active number (elapsed time, raised) is CMN blue and the target (`of 36:00`, `/ $5,000`) is dark gray. Progress bars are inset 3u on each side.
- **Goal layout:** a 3-column grid with the amounts centered over the bar and the percent pinned right. A `.tight`
  fallback left-aligns the amounts if they would collide with the percent (only possible with 5–6 digit totals in a
  box taller than the 82px design height). The check runs on each data render and on ResizeObserver. It was NOT verified in the
  desktop preview pane (its hidden-page throttling stops the observer); verify in mock mode if boxes get taller.
- **Goal display:** whole dollars, rounded down (never overstate), with a percent and a bar. The bar turns yellow at
  100% or more. The number tweens over 1.2 s; the first render is instant (no tween from 0 on scene switch).
- **Donation rotator:** round-robin between "my page" and "team" (team excludes my own donations), every 45 s (owner, 2026-10-21),
  cycling the 10 most recent of each. New donations, detected by `donationID`, interrupt immediately with a flash.
  The first snapshot is a baseline, so reloads do not replay alerts. Anonymous donors show as `Mysterious Hero`;
  hidden amounts show as `Private donation`.
- **Donations with messages (optional, 2026-10-21):** `/widgets/donation-messages` is 314×116 (taller Donations box,
  320×154 at 1580,24, with a 32px header). It reuses `donation-rotator/rotator.js` (`<body data-messages="on">`) plus
  `messages.css` (`--design-h: 116`). The message sits between the name/amount line and the tag line, up to 3 lines at
  13u. If it overflows, it drops to 12u; if it still overflows, it scrolls (4 s hold, about 0.5 line/s, 3 s hold, always
  within the turn) with faded edges. No text is cut. Sizing came from 305 real donations: 12% have messages, median
  49 chars, p90 129, max 326. The owner is reworking the sidebar (mascot slot removed), so the overlay art for the
  taller box is theirs; `/preview` draws the box itself.
- **Message filter:** `src/message-filter.ts` runs on the server, so flagged messages never reach a widget. It uses a
  built-in list plus `messageFilter.extraWords`, matches whole words, and handles leetspeak, stretched letters, accents
  and simple endings. It is a safety net, not moderation.
- **Widget sizes** are the white bodies of the overlay boxes. Footer boxes were made taller on 2026-10-21 (owner's
  choice): 494×128 (top 944, bottom 1072) with a 3px border and a 40px header, so the body is 488×82 at (23/533/1043, 987).
  The new layer is in the Asset Library folder `2026-10-21-bottom-bar-82px/`; the original checkpoint has 116px boxes (70px body). The Donations box is 320×96 with a 32px header, so the body is
  314×58 at (1583, 59). The source of truth is the overlay generator `build.py` in the 2026 Asset Library checkpoint.
- **Mock mode** swaps only the HTTP client (`MockApi` implements `get`), so preview exercises the real poller, parsers
  and store.
- **Public repo** so teammates can reuse it. The commit identity uses the GitHub noreply email.

## DonorDrive API facts (verified live 2026-10-21)

- Base `https://dd.extra-life.org/api` (the old `www.extra-life.org/api` 301-redirects). Docs: github.com/DonorDrive/PublicAPI.
- IDs are per event year. 2026 is `eventID` 562.
- Collections (`/participants`, `/teams`, `/events`) need credentials and return 401. Nested routes are public.
- `limit` max 100; headers `Num-Records`, `Link`, `ETag`, `Last-Modified`. Team donations stop at 1000 records.
- Anonymous donors: `displayName` is absent. Hidden amounts: `amount` is absent.
- 404 returns `text/html`. A rate limit returns a 401 with the body `Rate limit exceeded.` and is treated as a 429.
- A participant and their team can share an ETag. ETags are cached per URL, so this is harmless.

## Phase 2 (designed for, not built)

- Incentives/milestones: add poll resources (`participants/{id}/incentives`, `.../milestones`). `Donation.incentiveId`
  is already parsed.
- Scenes (starting soon, BRB, end, offline, commercials): full-canvas pages under `public/scenes/`, sharing
  `theme.css` and `live.js`.
- Subteam list: `teams/{id}/participants` resource.
