// Interactive setup: `npm run setup`. Writes config.json, MY-SOURCES.md (your browser sources), and launchers.
//
//   npm run setup                         # asks questions; press Enter to keep the [default]
//   npm run setup -- --defaults           # no questions: keep current values (or the example's)
//   npm run setup -- --defaults --participant 123456 --style framed --donations messages --theme midnight
//   add --offline to skip checking the IDs against Extra Life
//
// Re-runnable: it starts from your current config.json and keeps settings it does not ask about.

import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, DEFAULT_TITLES, parseConfig, THEMES_DIR, type Titles } from '../src/config.ts';
import { ExtraLifeClient } from '../src/extralife/client.ts';
import { parseParticipant, parseTeam } from '../src/extralife/parse.ts';
import { applyAnswers, colorOverrides, LAUNCHERS, parseIdInput, sourcesMarkdown, type SetupAnswers } from '../src/setup-core.ts';
import { HEX_RE, loadThemeDir, THEME_KEY_HELP, THEME_KEYS, resolveTheme, type ThemeColors } from '../src/theme.ts';
import { createPrompter, parseArgs } from './prompt.ts';
import { isValidTimeZone, parseEventTime } from '../src/time.ts';

const path = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { flag, option } = parseArgs(process.argv.slice(2));
const nonInteractive = flag('defaults');
const offline = flag('offline');

// ---- current values -------------------------------------------------------------
const hadConfig = existsSync(path('config.json'));
const baseRaw = JSON.parse(readFileSync(path(hadConfig ? 'config.json' : 'config.example.json'), 'utf8')) as Record<string, unknown>;
const custom = loadThemeDir(THEMES_DIR);
const current = parseConfig(baseRaw, { mock: true, themes: custom.themes });
const placeholder = (id: string) => id === '' || id === '123456' || id === '12345';
const client = new ExtraLifeClient({ baseUrl: current.extraLife.baseUrl, apiVersion: current.extraLife.apiVersion, timeoutMs: 10_000 });

// ---- prompts --------------------------------------------------------------------------
const { say, ask, choose, yes, close, interactive } = createPrompter({ interactive: !nonInteractive });
const rl = interactive;

const validTime = (tz: string) => (v: string) => {
	try {
		parseEventTime(v, tz);
		return null;
	} catch (err) {
		return (err as Error).message;
	}
};

// ---- questions ----------------------------------------------------------------------
say('\nExtra Life widgets setup. Press Enter to keep the [default].\n');

// Participant (checked live, so typos show up now instead of on stream)
let participantId = option('participant') ?? (placeholder(current.extraLife.participantId) ? '' : current.extraLife.participantId);
let suggestedTeam = option('team') ?? (placeholder(current.extraLife.teamId) ? '' : current.extraLife.teamId);
for (;;) {
	participantId = parseIdInput(await ask('Your Extra Life participant ID or page URL', participantId, (v) => (parseIdInput(v) ? null : 'required')));
	if (offline) break;
	const r = await client.get(`participants/${participantId}`);
	if (r.kind === 'ok') {
		const p = parseParticipant(r.data);
		say(`  Found: ${p.name}, ${p.eventName ?? 'Extra Life'}, goal $${p.goal.toLocaleString('en-US')}${p.teamName ? `, team ${p.teamName} (ID ${p.teamId})` : ', no team'}`);
		if (p.teamId && !option('team')) suggestedTeam = String(p.teamId);
		break;
	}
	const why = r.kind === 'error' ? r.message : 'unexpected response';
	if (!rl) throw new Error(`participant ${participantId}: ${why} (use --offline to skip the check)`);
	say(`  Could not find participant ${participantId}: ${why}`);
	if (await yes('Use it anyway?', false)) break;
}

let teamId = suggestedTeam;
for (;;) {
	teamId = parseIdInput(await ask('Team ID or team page URL', teamId, (v) => (parseIdInput(v) ? null : 'required')));
	if (offline) break;
	const r = await client.get(`teams/${teamId}`);
	if (r.kind === 'ok') {
		const t = parseTeam(r.data);
		say(`  Found team: ${t.name}, ${t.numParticipants} members, goal $${t.goal.toLocaleString('en-US')}`);
		break;
	}
	if (!rl) throw new Error(`team ${teamId}: ${r.kind === 'error' ? r.message : 'unexpected response'}`);
	say(`  Could not find team ${teamId}.`);
	if (await yes('Use it anyway?', false)) break;
}

// Event times
const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeZone = await ask('Time zone (IANA name)', hadConfig ? current.event.timeZone : systemTz || current.event.timeZone, (v) =>
	isValidTimeZone(v) ? null : 'not a time zone name, e.g. America/Chicago or Europe/London',
);
say('Stream times are local to that time zone, written YYYY-MM-DDTHH:MM (24-hour).');
const start = await ask('Stream start', current.event.start, validTime(timeZone));
const end = await ask('Stream end', current.event.end, (v) => validTime(timeZone)(v) ?? (parseEventTime(v, timeZone) > parseEventTime(start, timeZone) ? null : 'must be after the start'));

// Look
const style = (option('style') as 'framed' | 'transparent' | undefined) ?? (await choose<'framed' | 'transparent'>('\nDefault widget style (any single source can use the other one by adding ?style=framed or ?style=transparent to its URL):', [
	['framed', 'each widget draws its own box; place it anywhere (no overlay art needed)'],
	['transparent', 'widgets fill the white areas of boxes drawn in your overlay art'],
], current.display.style));
const donations = (option('donations') as 'standard' | 'messages' | undefined) ?? (await choose<'standard' | 'messages'>('\nDonations widget:', [
	['standard', 'donor, amount, tag (smaller box)'],
	['messages', 'also shows the donor\'s message (taller box)'],
], current.display.donations));
const intervalSeconds = Number(await ask('\nSeconds each donation stays on screen', String(current.rotation.intervalSeconds), (v) => (Number(v) > 0 ? null : 'enter a number of seconds')));

let titles: Titles = { ...current.display.titles };
if (rl && !(await yes('\nKeep these box titles? ' + Object.values(titles).join(' / '), true))) {
	say('Use {team} for your team\'s name.');
	titles = {
		countdown: await ask('Countdown title', titles.countdown || DEFAULT_TITLES.countdown),
		participantGoal: await ask('Your goal title', titles.participantGoal || DEFAULT_TITLES.participantGoal),
		teamGoal: await ask('Team goal title', titles.teamGoal || DEFAULT_TITLES.teamGoal),
		donations: await ask('Donations title', titles.donations || DEFAULT_TITLES.donations),
	};
}

// Colors
const registry = current.theme.available;
const presets = Object.keys(registry);
const themePreset = option('theme') ?? (await choose('\nColor theme (make your own with npm run theme):', presets.map((p) => [p, custom.descriptions[p] ?? Object.values(registry[p]!).slice(0, 3).join(' ')] as [string, string]), presets.includes(current.theme.preset) ? current.theme.preset : 'extra-life'));
let colors: ThemeColors = resolveTheme(themePreset, themePreset === current.theme.preset ? current.theme.colors : {}, registry);
if (rl && (await yes('Customize individual colors (hex codes)?', Object.keys(colorOverrides(themePreset, colors, registry)).length > 0))) {
	const next = { ...colors };
	for (const key of THEME_KEYS) {
		next[key] = (await ask(`  ${key} (${THEME_KEY_HELP[key]})`, colors[key], (v) => (HEX_RE.test(v) ? null : 'use a hex color like #0E7CA2'))).toUpperCase();
	}
	colors = next;
}

const port = Number(option('port') ?? (await ask('\nPort for the local server', String(current.server.port), (v) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536 ? null : 'enter a port number'))));
close();

// ---- write -----------------------------------------------------------------------------
const answers: SetupAnswers = {
	participantId, teamId, timeZone, start, end, style, donations, intervalSeconds, titles,
	themePreset, themeColors: colorOverrides(themePreset, colors, registry), port,
};
const nextRaw = applyAnswers(baseRaw, answers);
let config;
try {
	config = parseConfig(nextRaw, { themes: custom.themes });
} catch (err) {
	if (!(err instanceof ConfigError)) throw err;
	console.error(`\nNot saved. ${err.message}`);
	process.exit(1);
}

if (hadConfig) copyFileSync(path('config.json'), path('config.backup.json'));
writeFileSync(path('config.json'), `${JSON.stringify(nextRaw, null, '\t')}\n`);
writeFileSync(path('MY-SOURCES.md'), sourcesMarkdown(config));
for (const [name, text] of Object.entries(LAUNCHERS)) {
	writeFileSync(path(name), text);
	if (name.endsWith('.command')) chmodSync(path(name), 0o755);
}

say(`\nSaved config.json${hadConfig ? ' (previous version: config.backup.json)' : ''}, MY-SOURCES.md, and start-widgets launchers.`);
say('\nNext:');
say('  1. Start the server: double-click start-widgets.command (Mac) or start-widgets.bat (Windows), or run npm start.');
say(`  2. Check it: http://localhost:${port}/preview/`);
say('  3. Add the browser sources listed in MY-SOURCES.md:');
for (const r of sourcesFor()) say(`       ${r}`);
say('');

function sourcesFor(): string[] {
	return sourcesMarkdown(config!)
		.split('\n')
		.filter((l) => l.startsWith('| ') && !l.startsWith('| Source') && !l.startsWith('| ---'))
		.map((l) => l.split('|').slice(1, 4).map((c) => c.trim().replace(/`/g, '')).join('  '));
}
