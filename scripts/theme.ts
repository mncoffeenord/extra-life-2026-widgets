// Make a named color theme: `npm run theme`. Saves themes/<name>.json and prints the widget URLs that use it.
//
//   npm run theme                                   # asks questions; paste a color scheme or pick colors one by one
//   npm run theme -- --list                         # list every theme
//   npm run theme -- --name purple-night --from my-colors.txt [--base midnight] [--description "..."] --yes
//   npm run theme -- --name purple-night --colors "primary=6A1B9A, accent=FFB300" --yes
//   add --default to make it the default theme in config.json, --force to overwrite an existing theme
//
// A color scheme can be JSON ({"primary": "#6A1B9A", ...}), CSS variables (--primary: #6A1B9A;), "name: hex" lines,
// or a plain list of hex codes, used in order: primary, primaryLight, accent, text, muted, track, surface, headerText.
// The server reads themes/ on every widget page load, so a new theme works without a restart.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig, THEMES_DIR } from '../src/config.ts';
import type { Style } from '../src/sources.ts';
import { HEX_RE, loadThemeDir, normalizeHex, THEME_KEY_HELP, THEME_KEYS, THEME_NAME_RE, THEME_PRESETS, type ThemeColors } from '../src/theme.ts';
import { contrastWarnings, parseColorScheme, themeFileJson, themeSources } from '../src/theme-tools.ts';
import { createPrompter, parseArgs } from './prompt.ts';

const path = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
process.on('uncaughtException', (err) => {
	console.error(`\n${err.message}`);
	process.exit(1);
});
const { flag, option } = parseArgs(process.argv.slice(2));
const { say, ask, choose, yes, readBlock, close, interactive } = createPrompter({ interactive: !flag('yes') && !flag('list') });

const hadConfig = existsSync(path('config.json'));
const baseRaw = JSON.parse(readFileSync(path(hadConfig ? 'config.json' : 'config.example.json'), 'utf8')) as Record<string, unknown>;
const custom = loadThemeDir(THEMES_DIR);
for (const p of custom.problems) console.warn(`warning: ${p}`);
const config = parseConfig(baseRaw, { mock: true, themes: custom.themes });
const registry = config.theme.available;

const tty = process.stdout.isTTY;
const swatch = (hex: string) => {
	if (!tty) return '';
	let h = hex.slice(1);
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
	return `\x1b[48;2;${r};${g};${b}m    \x1b[0m `;
};
const showColors = (colors: ThemeColors) => {
	for (const k of THEME_KEYS) say(`  ${swatch(colors[k])}${k.padEnd(13)}${colors[k]}  ${THEME_KEY_HELP[k]}`);
};

if (flag('list')) {
	say('Themes (use one with ?theme=<name> on a widget URL, or set it as theme.preset in config.json):');
	for (const name of Object.keys(registry)) {
		const kind = Object.hasOwn(THEME_PRESETS, name) ? 'built-in' : `themes/${name}.json`;
		say(`  ${name.padEnd(20)} ${Object.values(registry[name]!).slice(0, 3).map(swatch).join('')}${kind}${name === config.theme.preset ? ' (default)' : ''}${custom.descriptions[name] ? `: ${custom.descriptions[name]}` : ''}`);
	}
	process.exit(0);
}

say('\nMake a color theme. Press Enter to keep the [default].\n');

// Name
const nameProblem = (v: string) => {
	if (!THEME_NAME_RE.test(v)) return 'use lowercase letters, digits and dashes, e.g. purple-night';
	if (Object.hasOwn(THEME_PRESETS, v)) return `"${v}" is a built-in theme; pick another name`;
	return null;
};
let name = option('name') ?? '';
for (;;) {
	name = await ask('Theme name', name, (v) => nameProblem(v));
	if (!Object.hasOwn(custom.themes, name) || flag('force')) break;
	if (!interactive) throw new Error(`themes/${name}.json already exists (add --force to overwrite it)`);
	if (await yes(`themes/${name}.json already exists. Overwrite it?`, false)) break;
	name = '';
}
const description = await ask('Short description (optional)', option('description') ?? custom.descriptions[name] ?? '');

// Starting point: an existing theme fills any colors the scheme leaves out.
const names = Object.keys(registry);
const baseOption = option('base');
if (baseOption && !names.includes(baseOption)) throw new Error(`--base ${baseOption}: unknown theme (choose ${names.join(', ')})`);
const startFrom = baseOption ?? (Object.hasOwn(custom.themes, name) ? name : 'extra-life');
const base = interactive && !baseOption
	? await choose('\nStart from which theme? (it fills any colors you leave out)', names.map((n) => [n, Object.values(registry[n]!).slice(0, 3).join(' ')] as [string, string]), startFrom)
	: startFrom;
let colors: ThemeColors = { ...registry[base]! };

// Drop in a scheme: a file, --colors, or pasted text.
let schemeText = '';
const from = option('from');
if (from) schemeText = readFileSync(from, 'utf8');
else if (option('colors')) schemeText = option('colors')!;
else if (interactive) {
	say('\nPaste a color scheme (JSON, CSS variables, "name: #hex" lines, or a list of hex codes),');
	say('then press Enter on an empty line. Or just press Enter to pick colors one by one.');
	schemeText = await readBlock('> ');
}
let pasted = false;
if (schemeText.trim()) {
	const scheme = parseColorScheme(schemeText);
	for (const p of scheme.problems) say(`  note: ${p}`);
	const keys = Object.keys(scheme.colors);
	if (keys.length === 0 && !interactive) throw new Error('no colors found in the scheme');
	if (scheme.positional) say(`  Read ${keys.length} hex codes in order as: ${keys.join(', ')}.`);
	else say(`  Read ${keys.length} colors: ${keys.join(', ')}.`);
	colors = { ...colors, ...scheme.colors };
	pasted = keys.length > 0;
}

if (interactive && (await yes('\nReview or change the colors one by one?', !pasted))) {
	for (const key of THEME_KEYS) {
		const value = await ask(`  ${key} (${THEME_KEY_HELP[key]})`, colors[key], (v) => (normalizeHex(v) ? null : 'use a hex color like #0E7CA2'));
		colors[key] = normalizeHex(value)!;
	}
}

say(`\nTheme "${name}":`);
showColors(colors);
const warnings = contrastWarnings(colors);
for (const w of warnings) say(`  warning: ${w}`);
if (warnings.length && interactive && !(await yes('Save it anyway?', true))) {
	say('Not saved.');
	close();
	process.exit(1);
}

// Save
if (!Object.values(colors).every((c) => HEX_RE.test(c))) throw new Error('internal: invalid color');
mkdirSync(THEMES_DIR, { recursive: true });
const file = join(THEMES_DIR, `${name}.json`);
writeFileSync(file, themeFileJson(colors, description));
say(`\nSaved themes/${name}.json.`);

const makeDefault = flag('default') || (interactive && (await yes(`Make "${name}" the default theme for every widget (config.json)?`, false)));
close();
if (makeDefault) {
	if (!hadConfig) {
		say('No config.json yet: run npm run setup first, then choose this theme there.');
	} else {
		copyFileSync(path('config.json'), path('config.backup.json'));
		writeFileSync(path('config.json'), `${JSON.stringify({ ...baseRaw, theme: { preset: name, colors: {} } }, null, '\t')}\n`);
		say(`Set theme.preset to "${name}" in config.json (previous version: config.backup.json). Restart the server to apply it.`);
	}
}

// Where to use it
const isDefault = makeDefault && hadConfig;
const style: Style = config.display.style;
say(`\nUse it per source: add ?theme=${name} to a widget URL. With your current settings (${style} style):`);
for (const row of themeSources({ ...config, theme: { ...config.theme, preset: isDefault ? name : config.theme.preset } }, name, style)) {
	say(`  ${row.name.padEnd(40)} ${row.url}  ${row.rect.w} x ${row.rect.h}`);
}
say(`\nSee it on the overlay: http://localhost:${config.server.port}/preview/?theme=${name}`);
say('No restart needed for ?theme= URLs. In Streamlabs, change the URL in the source\'s properties.');
say(`themes/${name}.json is a normal file: commit it to share the theme, or delete it to remove it.\n`);
