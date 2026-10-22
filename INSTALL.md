# Install guide

The short version: **one small server runs on your computer, and each widget is its own Browser Source in Streamlabs**
(or OBS). The server does all the talking to Extra Life; the sources only display what it sends them.

## 1. Install (about 10 minutes, once)

1. **Install Node.js 24 or newer** from <https://nodejs.org> (the LTS download is fine).
2. **Get the code.** Either `git clone https://github.com/mncoffeenord/extra-life-2026-widgets.git`, or download the
   ZIP from GitHub (**Code → Download ZIP**) and unzip it.
3. Open Terminal (Mac) or PowerShell (Windows) in that folder and run:

   ```bash
   npm install
   ```

   ```bash
   npm run setup
   ```

`npm run setup` asks a few questions. Press Enter to keep the suggested answer.

| Question | Notes |
| --- | --- |
| Participant ID or page URL | Paste your Extra Life page link. It is checked live, and your team is filled in from it. |
| Time zone, stream start and end | Local times, e.g. `2026-11-12T13:00`. Daylight saving is handled for you. |
| Style | **framed**: each widget draws its own box, so you can drop it anywhere (no overlay art needed). **transparent**: widgets fill the white areas of boxes in your own overlay art. |
| Donations widget | **standard**, or **messages** (also shows the donor's message, in a taller box). |
| Seconds per donation | How long each donation stays up in the rotation (default 45). |
| Box titles | Header text on framed boxes. `{team}` becomes your team's name. |
| Colors | A theme (`extra-life`, `midnight`, `mono`, or one you made with `npm run theme`), optionally with your own hex codes. |

It writes `config.json` (your settings), **`MY-SOURCES.md`** (your browser sources, with URLs and sizes), and
launchers. Run it again any time to change something; it keeps your other settings and backs up the old file.

## 2. Start the server (every stream)

Double-click **`start-widgets.command`** (Mac; it also keeps the Mac awake) or **`start-widgets.bat`** (Windows).
Or run `npm start`. Leave that window open for the whole stream.

Then open <http://localhost:4242/preview/>. You should see **Live data** and **API OK**, with numbers that match your
Extra Life page.

> Start the server **before** opening Streamlabs. If a widget is blank, open that source's properties and click
> **Refresh cache of current page**.

## 3. Add the widgets (once)

Open **`MY-SOURCES.md`**: it lists each source for your choices. Add only the ones you want: every widget and scene
works on its own, all from the same server. For each one, use **+ Add Source → Browser Source**, then:

- Leave **Local file** off and paste the URL.
- Set **Width** and **Height** from the list.
- Leave **Custom CSS** at its default.
- Turn **Shutdown source when not visible** off.
- Place it. Framed boxes can go anywhere; the listed positions match the GamePlan42 overlay. To type exact
  positions, use **right-click → Transform → Edit Transform**, at 100% scale.

For reference, the sizes:

| Widget | URL path | Framed | Transparent |
| --- | --- | --- | --- |
| Stream countdown | `/widgets/countdown` | 494 × 128 | 488 × 82 |
| My Extra Life goal | `/widgets/participant-goal` | 494 × 128 | 488 × 82 |
| Team goal | `/widgets/team-goal` | 494 × 128 | 488 × 82 |
| Donations | `/widgets/donation-rotator` | 320 × 96 | 314 × 58 |
| *or* Donations + messages | `/widgets/donation-messages` | 320 × 143 | 314 × 105 |

**Be Right Back scene (optional).** A full-screen break scene: latest donation, team goal hearts, your goal bar and
a countdown to the start (then `GAME TIME`, counting up). Make a new Streamlabs scene for it, for example "Be Right
Back", and add one Browser Source:

| Scene | URL path | Size | Position |
| --- | --- | --- | --- |
| Be Right Back | `/scenes/be-right-back` | 1920 × 1080 | 0, 0 |

Same settings as the widgets, plus **FPS** 30. Switch to that scene when you step away. It keeps its own colors, so
`?theme=` and `?style=` don't change it. To check it without live data, open
<http://localhost:4242/scenes/be-right-back?mock=1>.

Use **one** of the two Donations widgets. Any widget can switch style on its own by adding `?style=framed` or
`?style=transparent` to its URL, `?title=Your%20Title` sets its header text, and `?theme=midnight` its colors (see
[Colors and themes](#colors-and-themes)). Combine them with `&`: `?style=framed&theme=midnight`.

**Set them up once, use them everywhere:** put the sources in one scene, for example "Extra Life widgets", then add
that scene as a source to your other scenes.

## 4. Before going live

- [ ] Server is running, and `/preview` shows **API OK**.
- [ ] All widgets show data in Streamlabs (and the Be Right Back scene, if you use it).
- [ ] The countdown shows the right time to your start.

Want to rehearse? Stop the server and run `npm run mock` instead. `/preview` then gets buttons for fake donations,
jumping the clock, and simulating an outage. Stop it and start the server normally before you go live.

## Colors and themes

A theme is a named set of 8 colors. Three are built in (`extra-life`, `midnight`, `mono`), and you can make your own.
Themes apply to the widgets; the Be Right Back scene keeps its own design colors.

**Different colors per source.** Add `?theme=<name>` to a widget's URL, e.g.
`http://localhost:4242/widgets/countdown?theme=midnight`. One server can show a light widget in one scene and a dark
one in another. Single colors can be changed in the URL too, with or without a theme (no `#`, URLs can't hold one):
`?theme=midnight&primary=6A1B9A&accent=FFB300`. After changing a source's URL in Streamlabs, the widget reloads by itself.
A misspelled theme or color never blanks a widget: it falls back to your default colors, and the server window says why.
To try themes first, open <http://localhost:4242/preview/> and pick one from the **Theme** menu: the overlay redraws in
it, and the source table below it shows the URLs with `?theme=` added.

**Make your own theme.** Run:

```bash
npm run theme
```

It asks for a name, a theme to start from, and your colors. Paste them in almost any shape: JSON, CSS variables
(`--primary: #6A1B9A;`), `name: #hex` lines, or a plain list of hex codes such as a coolors.co palette (a plain list is
used in the order of the table below). It shows the result with color swatches, warns if text would be hard to read,
saves `themes/<name>.json`, and prints your widget URLs with `?theme=<name>` added. New themes work right away, with
no restart. If you change a theme that a source already shows, click **Refresh cache of current page** in that
source's properties. `npm run theme -- --list` shows every theme. Without questions:
`npm run theme -- --name purple-night --from my-colors.txt --base midnight --yes` (or `--colors "primary=6A1B9A,
accent=FFB300"`; add `--force` to overwrite a theme).

At the end it offers to make the theme your default (`--default`). That sets `theme.preset` in `config.json`, clears
any single-color overrides there, and backs up the old file; restart the server to apply it. Theme files are plain
JSON (format in [themes/README.md](themes/README.md)): commit one to share it, delete it to remove it.

**Change the default for every widget.** Re-run `npm run setup` (your own themes are in its list), or edit the `theme`
section of `config.json`, then restart the server:

```json
"theme": { "preset": "extra-life", "colors": { "primary": "#6A1B9A", "accent": "#FFB300" } }
```

| Color | Used for |
| --- | --- |
| `primary` | Box border and header, active numbers (raised, clock), MY PAGE tag, progress bar |
| `primaryLight` | End of the progress bar gradient |
| `accent` | Over-goal bar, TEAM tag, Overtime tag, new-donation flash |
| `text` | Main text (names, goal amounts) |
| `muted` | Secondary text (time ago, private amounts) |
| `track` | Progress bar background, "Starts in" tag |
| `surface` | Box background (framed style) |
| `headerText` | Header text and text on primary-colored tags |

More detail (how it works, troubleshooting, development) is in the [README](README.md).
