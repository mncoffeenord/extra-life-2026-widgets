import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ConfigError, parseConfig, DEFAULT_TITLES } from '../src/config.ts';
import { sourcesFor, titleFor, WIDGETS } from '../src/sources.ts';
import { HEX_RE, resolveTheme, THEME_KEYS, THEME_PRESETS, themeCss } from '../src/theme.ts';

const example = () => {
	const c = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
	c.extraLife.participantId = '581000';
	c.extraLife.teamId = '74000';
	return c;
};

test('every preset defines every color as hex', () => {
	for (const [name, colors] of Object.entries(THEME_PRESETS)) {
		for (const key of THEME_KEYS) assert.match(colors[key], HEX_RE, `${name}.${key}`);
	}
});

test('resolveTheme applies overrides and rejects bad input', () => {
	const t = resolveTheme('extra-life', { primary: '#c0ffee', accent: '#abc' });
	assert.equal(t.primary, '#C0FFEE');
	assert.equal(t.accent, '#ABC');
	assert.equal(t.text, THEME_PRESETS['extra-life']!.text);
	assert.throws(() => resolveTheme('neon'), /unknown theme preset/);
	assert.throws(() => resolveTheme('mono', { primary: 'blue' }), /hex color/);
	assert.throws(() => resolveTheme('mono', { glow: '#fff' }), /unknown theme color/);
});

test('themeCss emits every CSS variable', () => {
	const css = themeCss(resolveTheme('midnight'));
	for (const v of ['--primary:', '--primary-light:', '--accent:', '--text:', '--muted:', '--track:', '--surface:', '--header-text:']) assert.ok(css.includes(v), v);
	assert.ok(css.startsWith(':root{') && css.endsWith('}'));
});

test('config: display and theme defaults, and validation', () => {
	const c = parseConfig({ extraLife: { participantId: '1', teamId: '2' }, event: { start: '2026-11-12T13:00', end: '2026-11-14T01:00' } });
	assert.equal(c.display.style, 'framed'); // new setups default to self-contained boxes
	assert.equal(c.display.donations, 'standard');
	assert.deepEqual(c.display.titles, DEFAULT_TITLES);
	assert.equal(c.theme.resolved.primary, '#0E7CA2');

	const bad = example();
	bad.display = { style: 'boxed', donations: 'all', titles: { countdown: '' } };
	bad.theme = { preset: 'neon', colors: {} };
	try {
		parseConfig(bad);
		assert.fail('expected ConfigError');
	} catch (err) {
		assert.ok(err instanceof ConfigError);
		const text = err.problems.join('\n');
		for (const s of ['display.style', 'display.donations', 'display.titles.countdown', 'theme: unknown theme preset']) assert.ok(text.includes(s), s);
	}
});

test('partial titles keep the other defaults', () => {
	const c = example();
	c.display.titles = { teamGoal: '{team} rocks' };
	const parsed = parseConfig(c);
	assert.equal(parsed.display.titles.countdown, 'Stream countdown');
	assert.equal(titleFor(WIDGETS['team-goal'], parsed.display.titles, 'GamePlan42'), 'GamePlan42 rocks');
	assert.equal(titleFor(WIDGETS['team-goal'], parsed.display.titles, null), 'Team rocks');
});

test('geometry: framed box = body + 3px border + header', () => {
	for (const w of Object.values(WIDGETS)) {
		assert.equal(w.box.w, w.body.w + 6, w.id);
		assert.equal(w.box.h, w.body.h + 6 + w.head, w.id);
		assert.equal(w.body.x, w.box.x + 3, w.id);
		assert.equal(w.body.y, w.box.y + 3 + w.head, w.id);
	}
});

test('sourcesFor lists the footer widgets plus the chosen Donations version', () => {
	const c = parseConfig(example());
	const framed = sourcesFor(c);
	assert.deepEqual(framed.map((s) => s.id), ['countdown', 'participant-goal', 'team-goal', 'donation-rotator']);
	assert.equal(framed[0]!.url, 'http://localhost:4242/widgets/countdown');
	assert.deepEqual(framed[0]!.rect, { x: 20, y: 944, w: 494, h: 128 });

	const transparent = sourcesFor(c, 'transparent');
	assert.equal(transparent[3]!.url, 'http://localhost:4242/widgets/donation-rotator?style=transparent');
	assert.deepEqual(transparent[3]!.rect, { x: 1583, y: 325, w: 314, h: 58 });

	c.display.donations = 'messages';
	assert.equal(sourcesFor(c)[3]!.id, 'donation-messages');
	assert.deepEqual(sourcesFor(c)[3]!.rect, { x: 1580, y: 290, w: 320, h: 143 });
});
