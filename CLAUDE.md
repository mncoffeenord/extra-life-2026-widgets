# CLAUDE.md

Extra Life 2026 stream overlay widgets: a local Node server that polls the DonorDrive API and serves transparent widget
pages to Streamlabs (macOS) as Browser Sources. Owner streams for team GamePlan42. The event is Nov 12–13, 2026
(stream from 1 PM Thu Nov 12 to 1 AM Sat Nov 14, US Central).

## Commands

- `npm start`: live server on `http://localhost:4242` (preview at `/preview/`, widgets at `/widgets/<name>`)
- `npm run mock`: fake API plus preview controls (totals, donations, clock presets, outage)
- `npm run check`: type check and tests. Run it before every commit.
- `npm run record-fixtures -- --sample <busy participant id>`: re-record anonymized fixtures
- `npm run setup` / `npm run theme`: interactive installer / make a named color theme (`--list` lists them)

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
- Widget geometry is defined once in `src/sources.ts`; the preview and MY-SOURCES.md read it. The size tables in
  README.md and INSTALL.md are hand-written copies, so update them when sizes change.

## Never commit

- `config.json` (real IDs), `data/` (runtime cache), `local-assets/*` (overlay art with CMN branding; the BRB scene's Marvin is the exception, committed with the
  owner's OK on 2026-10-22), `scripts/raw/`
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
- **Donations with messages (optional, 2026-10-21):** `/widgets/donation-messages` is 314×105 (taller Donations box,
  320×143 at 1580,290, with a 32px header). The owner chose 116 first, then 105. It reuses `donation-rotator/rotator.js`
  (`<body data-messages="on">`) plus `messages.css` (`--design-h: 105`). The tag/time line is a footer pinned to the
  bottom; name/amount and message are centered vertically above it (`.center`). rotator.js gives the message as many
  whole lines as fit (2 at 13u, the same at 12u). On overflow it drops to 12u; if it still overflows, it scrolls (4 s
  hold, about 0.5 line/s, 3 s hold, always within the turn) with faded edges. No text is cut. Real data: 12% of
  donations have messages, median 49 chars, p90 129, max 326. The owner is reworking the sidebar, so the overlay art
  for the taller box is theirs; `/preview` draws the box itself.
- **Two styles (2026-10-21):** `transparent` (the widget fills a box drawn in overlay art) and `framed` (the widget
  draws its own box: 3px border, header, surface, at the box size: footer 494×128, Donations 320×96/143). One codebase:
  `public/shared/frame.js` (a classic script, run before the widget module) wraps `.widget` when the style is framed.
  The default comes from `config.display.style`, with per-source `?style=`/`?framed`/`?title=` overrides. In framed
  mode, `--u` comes from `--frame-u` (100vh / box height), so the content lays out exactly as when transparent. New
  setups default to framed; the owner's config is transparent.
- **Themes:** `src/theme.ts` has presets (extra-life, midnight, mono) plus hex overrides for 8 colors. The server
  injects `:root{--primary...}` and `window.EL_DISPLAY` (style, frame spec with the team title resolved) into each
  widget page (`serveWidget` in app.ts), so first paint is right. Widget CSS must use only the theme variables
  (`--primary --primary-light --accent --text --muted --track --surface --header-text`), never raw colors.
- **Custom themes and per-source themes (2026-10-21):** themes are named; the built-ins stay in `THEME_PRESETS`
  (code), custom ones are `themes/<name>.json` (`{description?, base?, colors}`; tracked in git so they can be shared).
  Widget URLs take `?theme=<name>` plus color parameters in any spelling (`primary=6A1B9A`, `header-text=%23FFF`),
  resolved by `themeFromQuery`; a named theme ignores config's color overrides, bare overrides build on the config
  theme. Bad values fall back to the configured theme and are logged, never a blank widget. The app re-reads
  `themes/` on each widget page load and for `/api/display` (`themesDir` in AppDeps), so `npm run theme` needs no
  restart; a broken theme file is a startup warning (`config.warnings`), not an error. One server serves light and
  dark sources side by side; running two servers was rejected (double API polling, shared cache file).
  `npm run theme` (`scripts/theme.ts`, pure parts in `src/theme-tools.ts`) parses JSON / CSS / name:hex / bare hex
  lists (bare lists map in THEME_KEYS order), warns on WCAG contrast (`contrastWarnings`; the built-ins must pass), and
  prints `?theme=` URLs. Prompt helpers shared with setup live in `scripts/prompt.ts`.
- **Geometry lives in `src/sources.ts`** (box + body per widget, GamePlan42 layout positions). It feeds the injection,
  `/api/display` (the preview builds its stage and source table from it), and setup's `MY-SOURCES.md`. Don't
  hard-code positions elsewhere.
- **Installer:** `npm run setup` (`scripts/setup.ts` prompts; `src/setup-core.ts` holds the tested pure parts). It
  checks IDs live, writes config.json (backup in config.backup.json, other keys kept), MY-SOURCES.md, and the
  launchers (all git-ignored). It uses its own line queue instead of readline.question() because piped answers
  arriving during the network check were dropped.
- **Message filter:** `src/message-filter.ts` runs on the server, so flagged messages never reach a widget. It uses a
  built-in list plus `messageFilter.extraWords`, matches whole words, and handles leetspeak, stretched letters, accents
  and simple endings. It is a safety net, not moderation.
- **Widget sizes** are the white bodies of the overlay boxes. Footer boxes were made taller on 2026-10-21 (owner's
  choice): 494×128 (top 944, bottom 1072) with a 3px border and a 40px header, so the body is 488×82 at (23/533/1043, 987).
  The new layer is in the Asset Library folder `2026-10-21-bottom-bar-82px/`; the original checkpoint has 116px boxes (70px body). The Donations box is 320×96 with a 32px header, so the body is
  314×58 at (1583, 325) in the marvin-framed rail (2026-10-21; it was (1583, 59) before the rail was reworked). The source of truth is the overlay generator `build.py` in the 2026 Asset Library checkpoint.
- **Mock mode** swaps only the HTTP client (`MockApi` implements `get`), so preview exercises the real poller, parsers
  and store.
- **Public repo** so teammates can reuse it. The commit identity uses the GitHub noreply email.

- **Be Right Back scene (2026-10-21):** `/scenes/be-right-back` (`public/scenes/be-right-back/`), a 1920×1080 opaque
  page drawn as one SVG from the approved design (`scene_BRB()` in the Asset Library checkpoint
  `2026-10-21-be-right-back-scenes`, coordinates copied as-is; the stars are its `random.seed(7)` output, hard-coded).
  Only BRB is built: the owner deferred the shared multi-scene shell, Starting Soon and the countdown API until those
  designs are decided. It uses the design's fixed palette, not the widget themes. Lettering is the pixel font in
  `public/shared/pixel-font.js` (5×7 glyphs, full A–Z/0–9 plus punctuation, accents stripped, unknown → `?`), never a CSS
  font. View logic is `public/shared/brb-model.js`: latest donation is the newest across my page and the team;
  "BE THE FIRST!" only when both `numDonations` are 0; hidden amounts show no amount. Donor names shrink px 9→6 to
  fit beside the amount, then truncate with `...`. Marvin (`public/scenes/be-right-back/marvin.png`) is committed
  with the owner's OK even though the repo is public. `test/scene-brb.test.ts` screenshots `?mock=1&still=1` with
  headless Chrome (no Playwright: no new dependency) and diffs it against `test/fixtures/brb-reference.png`, the
  approved render, skipping the areas changed since (`CHANGED_SINCE_DESIGN`). Chrome 153 on macOS doesn't exit after
  `--screenshot`, so the test waits for the file and kills it. The first snapshot is a baseline (no flash or
  step-fill on load). `?demo=1` plays sample donations (the shareable artifact is built from it).
- **BRB changes (owner, 2026-10-22):** meters never round up: `meterSlots` floors, keeps one slot lit even at $0 or
  with no goal, and lights all only at 100%+. Team hearts fill in halves (20 slots; a half is the left half including
  the center column). My-goal bar: 40 segments, same rule. The header strip is 66px (was 64) with the team name
  centered vertically (text plus shadow). The strip's heart is replaced by `sceneClock`: more than 48 h before the
  start `DD:HH:MM` + `UNTIL GAME DAY`, under that `HH:MM` + the same label (both round up to the minute), from the
  start `GAME TIME HH:MM` counting up (label in front, owner 2026-10-23) with no end time, and it keeps counting after
  the end. Mock/demo `?clock=game` (or `#game-time`, for the artifact) shows that state. It ticks on the server
  clock, so mock time travel works.

- **BRB light look (owner, 2026-10-22):** `?look=light` (default `dark`; not `?theme=`, which the widgets use). Spec:
  `scene_BRB_light()` in the Asset Library checkpoint `2026-10-22-be-right-back-light`; render in
  `test/fixtures/brb-light-reference.png`. Only colors and background art differ, all in the `LOOKS` table at the top
  of `brb.js` (page, sky gradient #8FD0EE→#E6F7FC over y 0–1010, grid white at .22, panel #1A5C80, strip #1C9ED6,
  empty heart #12445F, title shadow DARK so 8 ow 4, no stars, sun, three extra clouds drawn behind the plate/panel).
  Don't branch on the look inside render functions. The sun is `public/shared/pixel-sun.js` (port of the generator:
  5px halo/orb/shade/highlight, 2px tapered irregular rays, Python-style modulo for the angle math), static. The look
  is chosen by URL only (the page is static; a config default would need the server to serve it). `index.html` sets
  `data-look` before first paint so light never flashes dark. Both looks share every behavior.

- **BRB dark moon (owner, 2026-10-22):** the dark look has a crescent moon where the light look has its sun (centered
  215, 140), designed in this repo over six drafts (not in the Asset Library generator; spec handed back as
  `brb-dark-moon-spec.md` next to the light checkpoint). `moonLayers()` in `pixel-sun.js`: 5px cells; an outer disc
  r 78 minus a cut disc r 63 at (+46, -8), so it reads as an upright "C" opening right (a diagonal crescent looked like
  a banana), tilted 8° clockwise like the title, tips trimmed below 6px width. Warm pale cream body with a bright rim
  on the thick side, a deeper cream inner edge, six warm-grey craters. Glow: two pale-blue rings grown outward from
  the lit pixels (not a disc; the owner rejected a halo). Stars within 120px of the moon are not drawn. Static. The
  dark screenshot test skips its corner (`DARK_MOON`).

- **Starting Soon (owner, 2026-10-22):** not a live page. `public/scenes/starting-soon/starting-soon.gif` (the
  960×540 bob preview from the Asset Library, stretched to the canvas as an Image source) plus Extra Life's stock
  tracker as a Browser Source at 1920×88, (0, 992), over the plain `#1B4C6E` bar the design leaves at the bottom.
  The URL is the owner's: `eventID=553` (dark bar and white logo that match; 562 restyles it lighter), and the data
  follows `participantID`. `STARTING_SOON` in `src/sources.ts`; setup fills in the ID in MY-SOURCES.md.

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
- Scenes (starting soon, end, offline, commercials): full-canvas pages under `public/scenes/`, sharing `live.js`.
  BRB is built (above); reuse its pixel font and model rather than adding a shell before the designs are decided.
- Subteam list: `teams/{id}/participants` resource.
