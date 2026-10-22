// Be Right Back scene: route, and a screenshot diff against the approved design.
// The screenshot test needs Google Chrome (or CHROME_PATH) and skips without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApp, createClock } from '../src/app.ts';
import { parseConfig } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { decodePng, diffRatio } from './png.ts';

const config = parseConfig(JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8')), { mock: true });
/** The approved design render (scenes/renders/BRB.png in the 2026-10-21-be-right-back-scenes checkpoint). */
const REFERENCE = new URL('./fixtures/brb-reference.png', import.meta.url);
/**
 * Areas the owner changed after that render (2026-10-22): the header strip (2px taller, centered team name, clock in
 * place of the heart) and the 7th team heart (the mock's $3,250 of $5,000 is now 6 and a half hearts).
 */
const CHANGED_SINCE_DESIGN = [
	{ x: 196, y: 296, w: 1528, h: 76 },
	{ x: 1290, y: 640, w: 92, h: 84 },
];
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function start() {
	const server = createApp({ config, store: new Store(), clock: createClock(), log: () => {} });
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const close = () => new Promise<void>((resolve) => {
		server.closeAllConnections();
		server.close(() => resolve());
	});
	return { base, close };
}

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

/**
 * Headless Chrome screenshot at 1920x1080. Chrome (153, macOS) writes the file and then does not exit, so wait
 * for the file to appear and stop growing, then kill its process group.
 */
async function screenshot(file: string, url: string, profile: string) {
	const chrome = spawn(CHROME, [
		'--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run',
		'--no-default-browser-check', `--user-data-dir=${profile}`, '--window-size=1920,1080',
		'--virtual-time-budget=3000', `--screenshot=${file}`, url,
	], { stdio: 'ignore', detached: true });
	let exited = false;
	chrome.on('exit', () => (exited = true));
	try {
		let lastSize = -1;
		for (const started = Date.now(); Date.now() - started < 60_000; await sleep(250)) {
			const size = existsSync(file) ? statSync(file).size : 0;
			if (size > 0 && size === lastSize) return;
			lastSize = size;
			if (exited && size === 0) throw new Error('Chrome exited without writing a screenshot');
		}
		throw new Error('timed out waiting for the Chrome screenshot');
	} finally {
		if (!exited && chrome.pid) process.kill(-chrome.pid, 'SIGKILL');
	}
}

test('?mock=1 matches the approved BRB design within a small tolerance', { skip: existsSync(CHROME) ? false : 'needs Google Chrome (or CHROME_PATH)', timeout: 90_000 }, async () => {
	const t = await start();
	const dir = mkdtempSync(join(tmpdir(), 'brb-shot-'));
	try {
		const shot = join(dir, 'brb.png');
		await screenshot(shot, `${t.base}/scenes/be-right-back/?mock=1&still=1`, join(dir, 'profile'));
		const actual = decodePng(readFileSync(shot));
		const expected = decodePng(readFileSync(REFERENCE));
		const ratio = diffRatio(actual, expected, 48, CHANGED_SINCE_DESIGN);
		assert.ok(ratio < 0.005, `${(ratio * 100).toFixed(3)}% of pixels differ (screenshot kept at ${shot})`);
		rmSync(dir, { recursive: true, force: true });
	} finally {
		await t.close();
	}
});
