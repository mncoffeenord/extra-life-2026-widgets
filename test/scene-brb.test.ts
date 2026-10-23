// Be Right Back scene: route, and a screenshot diff against the approved design.
// The screenshot test needs Google Chrome (or CHROME_PATH) and skips without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng, diffRatio } from './png.ts';
import { needsChrome, screenshot, start } from './scene-shot.ts';

/**
 * The approved design renders: dark is scenes/renders/BRB.png (checkpoint 2026-10-21-be-right-back-scenes), light is
 * scenes/renders/BRB-light.png (checkpoint 2026-10-22-be-right-back-light).
 */
const REFERENCES = {
	dark: new URL('./fixtures/brb-reference.png', import.meta.url),
	light: new URL('./fixtures/brb-light-reference.png', import.meta.url),
};
/**
 * Areas the owner changed after those renders (2026-10-22), the same in both looks: the header strip (2px taller, centered team name, clock in
 * place of the heart) and the 7th team heart (the mock's $3,250 of $5,000 is now 6 and a half hearts).
 */
const CHANGED_SINCE_DESIGN = [
	{ x: 196, y: 296, w: 1528, h: 76 },
	{ x: 1290, y: 640, w: 92, h: 84 },
];
/** Dark only: the crescent moon added top-left (owner, 2026-10-22), with its glow and the two stars it displaced. */
const DARK_MOON = { x: 90, y: 14, w: 252, h: 252 };

test('scene route redirects to the trailing slash and keeps the query', async () => {
	const t = await start();
	try {
		const res = await fetch(`${t.base}/scenes/be-right-back?mock=1`, { redirect: 'manual' });
		assert.equal(res.status, 302);
		assert.equal(res.headers.get('location'), '/scenes/be-right-back/?mock=1');
		const page = await fetch(`${t.base}/scenes/be-right-back/?mock=1`);
		assert.equal(page.status, 200);
		assert.match(await page.text(), /brb\.js/);
		assert.equal((await fetch(`${t.base}/scenes/be-right-back/brb.js`)).status, 200);
		assert.equal((await fetch(`${t.base}/scenes/../src/app.ts`)).status, 404);
	} finally {
		await t.close();
	}
});

test('?mock=1 (no look: dark) matches the approved BRB design within a small tolerance', needsChrome, () => matchesDesign('', 'dark'));
test('?look=light&mock=1 matches the approved light BRB design within a small tolerance', needsChrome, () => matchesDesign('look=light&', 'light'));

async function matchesDesign(query: string, look: keyof typeof REFERENCES) {
	const t = await start();
	const dir = mkdtempSync(join(tmpdir(), 'brb-shot-'));
	try {
		const shot = join(dir, 'brb.png');
		await screenshot(shot, `${t.base}/scenes/be-right-back/?${query}mock=1&still=1`, join(dir, 'profile'));
		const actual = decodePng(readFileSync(shot));
		const expected = decodePng(readFileSync(REFERENCES[look]));
		const ratio = diffRatio(actual, expected, 48, look === 'dark' ? [...CHANGED_SINCE_DESIGN, DARK_MOON] : CHANGED_SINCE_DESIGN);
		assert.ok(ratio < 0.005, `${(ratio * 100).toFixed(3)}% of pixels differ (screenshot kept at ${shot})`);
		rmSync(dir, { recursive: true, force: true });
	} finally {
		await t.close();
	}
}
