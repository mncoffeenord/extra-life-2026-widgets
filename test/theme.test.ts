import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, parseConfig } from '../src/config.ts';
import { loadThemeDir, normalizeHex, resolveTheme, THEME_PRESETS, themeFromQuery, themeKeyFor } from '../src/theme.ts';
import { contrast, contrastWarnings, parseColorScheme, themeFileJson, themeSources, withTheme } from '../src/theme-tools.ts';

const tempDir = () => mkdtempSync(join(tmpdir(), 'el-themes-'));
const eventOnly = { extraLife: { participantId: '1', teamId: '2' }, event: { start: '2026-11-12T13:00', end: '2026-11-14T01:00' } };

test('color names and hex values are accepted in common spellings', () => {
	for (const n of ['primaryLight', 'primary-light', '--primary-light', 'primary_light', 'PrimaryLight']) assert.equal(themeKeyFor(n), 'primaryLight');
	assert.equal(themeKeyFor('title'), null);
	assert.equal(normalizeHex('6a1b9a'), '#6A1B9A');
	assert.equal(normalizeHex(' #fff '), '#FFF');
	assert.equal(normalizeHex('blue'), null);
	assert.equal(normalizeHex('#12345'), null);
});

test('loadThemeDir reads good theme files and reports bad ones without failing', () => {
	const dir = tempDir();
	try {
		writeFileSync(join(dir, 'purple-night.json'), JSON.stringify({ description: 'Purple', base: 'midnight', colors: { primary: '#6a1b9a' } }));
		writeFileSync(join(dir, 'full.json'), themeFileJson(resolveTheme('mono', { accent: '#FF0000' }), 'Full file'));
		writeFileSync(join(dir, 'Bad Name.json'), '{}');
		writeFileSync(join(dir, 'midnight.json'), '{}');
		writeFileSync(join(dir, 'broken.json'), '{ nope');
		writeFileSync(join(dir, 'bad-color.json'), JSON.stringify({ colors: { primary: 'purple' } }));
		writeFileSync(join(dir, 'notes.txt'), 'ignored');
		const { themes, descriptions, problems } = loadThemeDir(dir);
		assert.deepEqual(Object.keys(themes).sort(), ['full', 'purple-night']);
		assert.equal(themes['purple-night']!.primary, '#6A1B9A');
		assert.equal(themes['purple-night']!.surface, THEME_PRESETS.midnight!.surface);
		assert.deepEqual(themes.full, resolveTheme('mono', { accent: '#FF0000' }));
		assert.deepEqual(descriptions, { 'purple-night': 'Purple', full: 'Full file' });
		assert.equal(problems.length, 4);
		assert.ok(problems.some((p) => p.includes('Bad Name.json') && p.includes('lowercase')));
		assert.ok(problems.some((p) => p.includes('midnight.json') && p.includes('built-in')));
		assert.ok(problems.some((p) => p.includes('broken.json')));
		assert.ok(problems.some((p) => p.includes('bad-color.json') && p.includes('hex')));
		assert.deepEqual(loadThemeDir(join(dir, 'missing')), { themes: {}, descriptions: {}, problems: [] });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('config can use a custom theme as its preset; broken theme files are warnings', () => {
	const dir = tempDir();
	try {
		writeFileSync(join(dir, 'purple-night.json'), JSON.stringify({ colors: { primary: '#6A1B9A' } }));
		writeFileSync(join(dir, 'broken.json'), '{ nope');
		const file = join(dir, 'config.json');
		writeFileSync(file, JSON.stringify({ ...eventOnly, theme: { preset: 'purple-night', colors: { accent: '#FF0000' } } }));
		const c = loadConfig(file, { themesDir: dir });
		assert.equal(c.theme.resolved.primary, '#6A1B9A');
		assert.equal(c.theme.resolved.accent, '#FF0000');
		assert.ok(Object.hasOwn(c.theme.available, 'midnight'));
		assert.equal(c.warnings.length, 1);
		assert.throws(() => parseConfig({ ...eventOnly, theme: { preset: 'purple-night' } }), /unknown theme preset "purple-night"/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('themeFromQuery: name, overrides, and safe fallbacks', () => {
	const registry = { ...THEME_PRESETS };
	const fallback = resolveTheme('extra-life', { accent: '#FF0000' });
	const q = (s: string) => themeFromQuery(new URLSearchParams(s), fallback, registry);
	assert.deepEqual(q('').colors, fallback);
	assert.deepEqual(q('theme=mono').colors, THEME_PRESETS.mono); // a named theme ignores config's own overrides
	assert.equal(q('primary=123456').colors.accent, '#FF0000'); // overrides without a name build on the config theme
	assert.equal(q('theme=mono&primary_light=abc').colors.primaryLight, '#ABC');
	const bad = q('theme=neon&text=nope&style=framed&title=Hi');
	assert.deepEqual(bad.colors, fallback);
	assert.equal(bad.problems.length, 2);
});

test('parseColorScheme reads JSON, theme files, CSS, name/value lines and hex lists', () => {
	assert.deepEqual(parseColorScheme('{"primary":"#6a1b9a","header-text":"fff"}').colors, { primary: '#6A1B9A', headerText: '#FFF' });
	assert.deepEqual(parseColorScheme(themeFileJson(THEME_PRESETS.mono!, 'x')).colors, THEME_PRESETS.mono);
	const css = parseColorScheme(':root {\n  --primary: #6A1B9A;\n  --primary-light: #9C4DCC;\n  --glow: #ffffff;\n}');
	assert.deepEqual(css.colors, { primary: '#6A1B9A', primaryLight: '#9C4DCC' });
	assert.equal(css.problems.length, 1);
	assert.deepEqual(parseColorScheme('accent = FFB300, text: "#111111"').colors, { accent: '#FFB300', text: '#111111' });
	const list = parseColorScheme('https://coolors.co/0b132b-1c2541-ff6b6b');
	assert.ok(list.positional);
	assert.deepEqual(list.colors, { primary: '#0B132B', primaryLight: '#1C2541', accent: '#FF6B6B' });
	assert.equal(Object.keys(parseColorScheme('#111 #222 #333 #444 #555 #666 #777 #888 #999').colors).length, 8);
	assert.deepEqual(parseColorScheme('hello there').problems, ['no colors found']);
});

test('contrast checks flag unreadable themes and pass the built-ins', () => {
	assert.equal(Math.round(contrast('#000', '#FFFFFF')), 21);
	assert.equal(contrast('#777777', '#777'), 1);
	for (const [name, colors] of Object.entries(THEME_PRESETS)) assert.deepEqual(contrastWarnings(colors), [], name);
	const warnings = contrastWarnings(resolveTheme('midnight', { primary: '#6A1B9A' }));
	assert.equal(warnings.length, 1);
	assert.match(warnings[0]!, /primary #6A1B9A on surface #1B2733/);
});

test('themeSources adds ?theme= to each widget URL unless it is the default', () => {
	const c = parseConfig({ ...eventOnly, display: { style: 'transparent' } });
	assert.equal(withTheme('http://x/widgets/a?style=framed', 'purple night'), 'http://x/widgets/a?style=framed&theme=purple%20night');
	const rows = themeSources(c, 'midnight');
	assert.equal(rows[0]!.url, 'http://localhost:4242/widgets/countdown?theme=midnight');
	assert.equal(themeSources(c, 'midnight', 'framed')[0]!.url, 'http://localhost:4242/widgets/countdown?style=framed&theme=midnight');
	assert.equal(themeSources(c, 'extra-life')[0]!.url, 'http://localhost:4242/widgets/countdown');
});
