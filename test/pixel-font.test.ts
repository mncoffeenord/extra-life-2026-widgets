import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPixelText, GLYPHS, normalizePixelText, pixelRuns, pixelWidth } from '../public/shared/pixel-font.js';

const REQUIRED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + ".,'-!?&$/:#";
const SCENE_STRINGS = ['EXTRA LIFE 2026', 'BE RIGHT BACK', 'GAMEPLAN42', 'LATEST DONATION', 'TEAM GOAL', 'MY GOAL', 'BE THE FIRST!', 'SAM K.', '$3,250 / $5,000', '$1,234.56', '...'];

test('every required character has a well-formed 5x7 glyph', () => {
	for (const ch of REQUIRED) {
		const g = GLYPHS[ch];
		assert.ok(g, `missing glyph ${JSON.stringify(ch)}`);
		assert.equal(g.length, 7, ch);
		for (const row of g) assert.match(row, /^[01]{5}$/, ch);
		assert.ok(pixelRuns(ch, 1, 0, 0).length > 0, `glyph ${ch} draws nothing`);
	}
});

test('every character of the scene strings renders (no fallback)', () => {
	for (const s of SCENE_STRINGS) {
		assert.equal(normalizePixelText(s), s);
		for (const ch of s) assert.ok(ch === ' ' || GLYPHS[ch], `${JSON.stringify(ch)} in ${s}`);
	}
});

test('normalize: uppercase, accents, look-alikes, unknown characters become ?', () => {
	assert.equal(normalizePixelText('  zoë   o’brien  '), "ZOE O'BRIEN");
	assert.equal(normalizePixelText('Jo 🎮 Q'), 'JO ? Q');
	assert.equal(normalizePixelText('a_b…'), 'A-B...');
	assert.equal(normalizePixelText(null), '');
	for (const ch of normalizePixelText('<script>{x}|~^ñ漢字')) assert.ok(ch === ' ' || GLYPHS[ch]);
});

test('width: 6 cells per character, 4 per space, minus the trailing gap', () => {
	assert.equal(pixelWidth('SAM K.', 9), 6 * 9 * 5 + 4 * 9 - 9);
	assert.equal(pixelWidth('$25', 9), 153);
	assert.equal(pixelWidth('', 9), 0);
});

test('runs merge horizontal cells per row', () => {
	// "-" is one 5-wide run in row 3
	assert.deepEqual(pixelRuns('-', 2, 10, 20), [{ x: 10, y: 26, w: 10, h: 2 }]);
});

test('fit: shrinks one px at a time, then truncates with ... at the minimum', () => {
	assert.deepEqual(fitPixelText('SAM K.', 600, 9, 6), { text: 'SAM K.', px: 9, truncated: false });
	const twelve = 'ABCDEFGHIJKL'; // 12 chars: 72px*12 - px
	assert.equal(fitPixelText(twelve, 600, 9, 6).px, 8); // 9: 639, 8: 568
	const long = 'THE GREAT AND POWERFUL DONOR OF EXTRA LIFE';
	const fit = fitPixelText(long, 600, 9, 6);
	assert.equal(fit.px, 6);
	assert.ok(fit.truncated);
	assert.ok(fit.text.endsWith('...'));
	assert.ok(pixelWidth(fit.text, 6) <= 600);
	assert.ok(!fit.text.includes(' ...'), 'no space before the dots');
});

test('fit never overflows, for any width and odd input', () => {
	for (const w of [0, 10, 50, 333, 600, 900]) {
		for (const s of ['W'.repeat(80), 'A B C D E F G H I J K L M N O P', '?', '']) {
			const fit = fitPixelText(normalizePixelText(s), w, 9, 6);
			assert.ok(pixelWidth(fit.text, fit.px) <= w, `${s} in ${w}`);
		}
	}
});
