# Install guide

The short version: **one small server runs on your computer, and each widget is its own Browser Source in Streamlabs**
(four sources, each with its own URL, size, and position). The server does all the talking to Extra Life; the sources
only display what it sends them.

## 1. One-time setup (about 10 minutes)

1. **Install Node.js 24 or newer** from <https://nodejs.org> (the LTS download is fine).
2. **Get the code.** Either `git clone https://github.com/mncoffeenord/extra-life-2026-widgets.git`, or download the
   ZIP from GitHub (**Code → Download ZIP**) and unzip it.
3. **Install it.** Open Terminal (Mac) or PowerShell (Windows) in that folder and run:

   ```bash
   npm install
   ```

4. **Configure it.** Copy `config.example.json` to `config.json`, then edit:
   - `participantId`: the number at the end of your Extra Life page URL (`dd.extra-life.org/participants/123456`)
   - `teamId`: your team's number or URL name (`dd.extra-life.org/teams/GamePlan42` → `"GamePlan42"`)
   - `start` / `end`: your stream times in your local time, for example `"2026-11-12T13:00"`
   - `timeZone`: for example `"America/Chicago"`

## 2. Start the server (every stream)

```bash
npm start
```

On a Mac, use `caffeinate -is npm start` so the computer doesn't sleep. Leave that window open for the whole stream.

Then open <http://localhost:4242/preview/> in a browser. You should see **Live data** and **API OK**, with numbers
that match your Extra Life page.

> Start the server **before** opening Streamlabs. If a widget is blank, open that source's properties and click
> **Refresh cache of current page**.

## 3. Add the widgets to Streamlabs (one time)

Add each one with **+ Add Source → Browser Source**:

| Source name | URL | Width × Height | Position X, Y |
| --- | --- | --- | --- |
| EL Countdown | `http://localhost:4242/widgets/countdown` | 488 × 82 | 23, 987 |
| EL My Goal | `http://localhost:4242/widgets/participant-goal` | 488 × 82 | 533, 987 |
| EL Team Goal | `http://localhost:4242/widgets/team-goal` | 488 × 82 | 1043, 987 |
| EL Donations | `http://localhost:4242/widgets/donation-rotator` | 314 × 58 | 1583, 325 |
| *or* EL Donations + messages | `http://localhost:4242/widgets/donation-messages` | 314 × 105 | 1583, 325 |

Pick **one** EL Donations source. The messages version shows each donor's message under their name (long ones shrink, then scroll), and needs a
taller Donations box in your overlay: 320 × 143 at x 1580, y 290, with the 32px header. Messages that match a word
list are hidden automatically (see `messageFilter` in the README).

For each source:

- Leave **Local file** off and **Custom CSS** at its default (the widgets are already transparent).
- Turn **Shutdown source when not visible** off.
- Set the position under **right-click → Transform → Edit Transform**, at 100% scale.

The positions match the GamePlan42 overlay on a 1920 × 1080 canvas, using the **taller footer boxes** (the bottom-bar
layer from 2026-10-21, with boxes 128px tall). On a different overlay, set each source to the size of the white area
it should fill. The widgets scale to the height you give them.

**Set them up once, use them everywhere:** put the four sources in one scene, for example "Extra Life widgets", then
add that scene as a source to each of your other scenes. A change to the widgets scene then shows up in all of them.

## 4. Before going live

- [ ] Server is running, and `/preview` shows **API OK**.
- [ ] All four widgets show data in Streamlabs.
- [ ] The countdown shows the right time to your start.

Want to rehearse? Stop the server and run `npm run mock` instead. `/preview` then gets buttons for fake donations,
jumping the clock, and simulating an outage. Stop it and run `npm start` again before you go live.

More detail (how it works, troubleshooting, development) is in the [README](README.md).
