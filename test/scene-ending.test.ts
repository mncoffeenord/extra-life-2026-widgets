// Ending scene: route and art files, and a screenshot diff of each look against the owner's final render.
// The screenshot tests need Google Chrome (or CHROME_PATH) and skip without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng, diffRatio } from './png.ts';
import { needsChrome, screenshot, start } from './scene-shot.ts';

/**
 * The owner's final static renders (Asset Library `01 Full-Screen Scenes/Ending - Dark|Light/ending-*-static.png`,
 * 2026-10-22). Their sample value, "$3,250 / $5,000", is the page's ?mock=1 value, so nothing is masked.
 */
const REFERENCES = {
	dark: new URL('./fixtures/ending-reference.png', import.meta.url),
	light: new URL('./fixtures/ending-light-reference.png', import.meta.url),
};

/** The live team goal value (right edge x 1770, rows y 995-1030, tilted), with room for its outline and shadow. */
const VALUE_BOX = { x: 1330, y: 985, w: 450, h: 55 };
/** Everything except VALUE_BOX, so a diff can be measured over the value alone. */
const OUTSIDE_VALUE = [
	{ x: 0, y: 0, w: 1920, h: VALUE_BOX.y },
	{ x: 0, y: VALUE_BOX.y + VALUE_BOX.h, w: 1920, h: 1080 - VALUE_BOX.y - VALUE_BOX.h },
	{ x: 0, y: VALUE_BOX.y, w: VALUE_BOX.x, h: VALUE_BOX.h },
	{ x: VALUE_BOX.x + VALUE_BOX.w, y: VALUE_BOX.y, w: 1920 - VALUE_BOX.x - VALUE_BOX.w, h: VALUE_BOX.h },
];

test('ending route serves the page, both art files and their images, without the placeholder value', async () => {
	const t = await start();
	try {
		const res = await fetch(`${t.base}/scenes/ending?look=light`, { redirect: 'manual' });
		assert.equal(res.status, 302);
		assert.equal(res.headers.get('location'), '/scenes/ending/?look=light');
		assert.match(await (await fetch(`${t.base}/scenes/ending/`)).text(), /ending\.js/);
		for (const look of ['dark', 'light']) {
			const art = await fetch(`${t.base}/scenes/ending/art-${look}.svg`);
			assert.equal(art.status, 200);
			assert.equal(art.headers.get('content-type')?.split(';')[0], 'image/svg+xml');
			const text = await art.text();
			assert.match(text, /href="marvin\.png"/);
			assert.match(text, /href="extra-life-logo\.svg"/);
			assert.doesNotMatch(text, /translate\(1770 1013\)/, 'the placeholder team goal value is removed');
			assert.doesNotMatch(text, /data:image/);
		}
		assert.equal((await fetch(`${t.base}/scenes/ending/marvin.png`)).status, 200);
		assert.equal((await fetch(`${t.base}/scenes/ending/extra-life-logo.svg`)).status, 200);
	} finally {
		await t.close();
	}
});

test('Ending ?mock=1 (dark) matches the final render, live value included', needsChrome, () => matchesDesign('', 'dark'));
test('Ending ?look=light&mock=1 matches the final light render, live value included', needsChrome, () => matchesDesign('look=light&', 'light'));

async function matchesDesign(query: string, look: keyof typeof REFERENCES) {
	const t = await start();
	const dir = mkdtempSync(join(tmpdir(), 'ending-shot-'));
	try {
		const shot = join(dir, 'ending.png');
		await screenshot(shot, `${t.base}/scenes/ending/?${query}mock=1&still=1`, join(dir, 'profile'));
		const actual = decodePng(readFileSync(shot));
		const expected = decodePng(readFileSync(REFERENCES[look]));
		const ratio = diffRatio(actual, expected, 48, []);
		assert.ok(ratio < 0.005, `${(ratio * 100).toFixed(3)}% of pixels differ (screenshot kept at ${shot})`);
		// the whole-screen tolerance is about as large as the value itself, so check the live value on its own, strictly
		const valueRatio = (diffRatio(actual, expected, 48, OUTSIDE_VALUE) * 1920 * 1080) / (VALUE_BOX.w * VALUE_BOX.h);
		assert.ok(valueRatio < 0.002, `${(valueRatio * 100).toFixed(3)}% of the team goal value differs (screenshot kept at ${shot})`);
		rmSync(dir, { recursive: true, force: true });
	} finally {
		await t.close();
	}
}
