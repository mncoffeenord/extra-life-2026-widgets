// Shared by the scene tests: an in-process mock server and a headless Chrome screenshot.
// The screenshot tests need Google Chrome (or CHROME_PATH) and skip without it.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApp, createClock } from '../src/app.ts';
import { parseConfig } from '../src/config.ts';
import { Store } from '../src/store.ts';

const config = parseConfig(JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8')), { mock: true });
/** Google Chrome's usual install location per platform; set CHROME_PATH for anything else. */
const DEFAULT_CHROME: Partial<Record<NodeJS.Platform, string>> = {
	darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	linux: '/usr/bin/google-chrome',
};
export const CHROME = process.env.CHROME_PATH ?? DEFAULT_CHROME[process.platform] ?? 'google-chrome';
const WINDOWS = process.platform === 'win32';

export async function start() {
	const server = createApp({ config, store: new Store(), clock: createClock(), log: () => {} });
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const close = () => new Promise<void>((resolve) => {
		server.closeAllConnections();
		server.close(() => resolve());
	});
	return { base, close };
}

/**
 * Headless Chrome screenshot at 1920x1080. Chrome (153, macOS) writes the file and then does not exit, so wait
 * for the file to appear and stop growing, then kill it (its whole process group on macOS/Linux; Windows has no
 * process groups, so just the process).
 */
export async function screenshot(file: string, url: string, profile: string) {
	const chrome = spawn(CHROME, [
		'--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run',
		'--no-default-browser-check', `--user-data-dir=${profile}`, '--window-size=1920,1080',
		'--virtual-time-budget=3000', `--screenshot=${file}`, url,
	], { stdio: 'ignore', detached: !WINDOWS });
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
		if (!exited && chrome.pid) {
			if (WINDOWS) chrome.kill('SIGKILL');
			else process.kill(-chrome.pid, 'SIGKILL');
		}
	}
}

export const needsChrome = { skip: existsSync(CHROME) ? false : 'needs Google Chrome (or CHROME_PATH)', timeout: 90_000 };
