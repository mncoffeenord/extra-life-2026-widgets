import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { createApp, createClock } from '../src/app.ts';
import { parseConfig } from '../src/config.ts';
import { parseDonations, parseParticipant, parseTeam } from '../src/extralife/parse.ts';
import { MockApi } from '../src/mock.ts';
import { Poller } from '../src/poller.ts';
import { RESOURCE_KEYS, Store } from '../src/store.ts';

const config = parseConfig(JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8')), { mock: true });

async function start({ withMock = true } = {}) {
	const clock = createClock();
	const store = new Store();
	const mock = new MockApi(() => clock.now());
	const poller = new Poller({
		client: mock,
		store,
		minGapMs: 0,
		maxBackoffMs: 1000,
		log: () => {},
		resources: [
			{ key: 'participant', path: 'participants/1', intervalMs: 1000, apply: (d) => store.setParticipant(parseParticipant(d)) },
			{ key: 'team', path: 'teams/2', intervalMs: 1000, apply: (d) => store.setTeam(parseTeam(d)) },
			{ key: 'participantDonations', path: 'participants/1/donations?limit=10', intervalMs: 1000, apply: (d) => store.setDonations('participant', parseDonations(d)) },
			{ key: 'teamDonations', path: 'teams/2/donations?limit=10', intervalMs: 1000, apply: (d) => store.setDonations('team', parseDonations(d)) },
		],
	});
	const server = createApp({ config, store, clock, poller, mock: withMock ? mock : undefined, log: () => {} });
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const pollAll = async () => {
		for (const k of RESOURCE_KEYS) await poller.poll(k);
	};
	const close = () => new Promise<void>((resolve) => {
		server.closeAllConnections();
		server.close(() => resolve());
	});
	const getJson = async (path: string) => (await fetch(base + path)).json();
	const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
	return { base, store, mock, clock, pollAll, close, getJson, post };
}

test('state is well-formed before any data arrives (no crash, nulls not NaN)', async () => {
	const t = await start();
	try {
		const s = await t.getJson('/api/state');
		assert.equal(s.participant, null);
		assert.deepEqual(s.donations, { participant: [], team: [] });
		assert.equal(s.event.endMs - s.event.startMs, 36 * 3_600_000);
		const h = await t.getJson('/api/health');
		assert.equal(h.ok, false);
		assert.equal(h.hasData, false);
	} finally {
		await t.close();
	}
});

test('JSON endpoints expose polled data', async () => {
	const t = await start();
	try {
		await t.pollAll();
		const p = await t.getJson('/api/participant');
		assert.equal(p.data.raised, 1250);
		assert.equal(p.data.goal, 2000);
		assert.ok(p.updatedAt);
		const team = await t.getJson('/api/team');
		assert.equal(team.data.name, 'GamePlan42');
		const d = await t.getJson('/api/donations');
		assert.equal(d.participant.length, 3);
		assert.ok(d.team.length >= 3);
		assert.equal((await t.getJson('/api/health')).ok, true);
	} finally {
		await t.close();
	}
});

test('countdown endpoint follows the (mock) clock', async () => {
	const t = await start();
	try {
		t.clock.offsetMs = config.event.startMs + 7 * 3_600_000 + 42 * 60_000 - Date.now();
		const c = await t.getJson('/api/countdown');
		assert.equal(c.phase, 'live');
		assert.equal(c.primary, '07:42');
		assert.equal(c.secondary, 'of 36:00');
		assert.equal(c.timeZone, 'America/Chicago');
	} finally {
		await t.close();
	}
});

test('outage keeps the last-known-good values and reports it in health only', async () => {
	const t = await start();
	try {
		await t.pollAll();
		await t.post('/api/mock/outage', { down: true });
		await t.pollAll();
		const p = await t.getJson('/api/participant');
		assert.equal(p.data.raised, 1250);
		const h = await t.getJson('/api/health');
		assert.equal(h.ok, false);
		assert.equal(h.hasData, true);
		assert.match(h.resources.participant.lastError, /mock outage/);
		await t.post('/api/mock/outage', { down: false });
		await t.pollAll();
		assert.equal((await t.getJson('/api/health')).ok, true);
	} finally {
		await t.close();
	}
});

test('mock donation flows through polling into totals and donation lists', async () => {
	const t = await start();
	try {
		await t.pollAll();
		await t.post('/api/mock/donation', { scope: 'mine', donorName: 'Test Donor', amount: 42 });
		await t.pollAll();
		const s = await t.getJson('/api/state');
		assert.equal(s.participant.raised, 1292);
		assert.equal(s.donations.participant[0].donorName, 'Test Donor');
		assert.equal(s.donations.participant[0].amount, 42);
		await t.post('/api/mock/donation', { scope: 'team', donorName: null, amount: null });
		await t.pollAll();
		const s2 = await t.getJson('/api/state');
		assert.equal(s2.donations.team[0].donorName, null);
		assert.equal(s2.donations.team[0].amount, null);
	} finally {
		await t.close();
	}
});

test('SSE sends a snapshot on connect and again on change', async () => {
	const t = await start();
	try {
		const res = await fetch(`${t.base}/api/stream`);
		assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		const nextSnapshot = async () => {
			while (true) {
				const idx = buffer.indexOf('\n\n');
				if (idx >= 0) {
					const block = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 2);
					const data = block.split('\n').find((l) => l.startsWith('data: '));
					if (block.includes('event: snapshot') && data) return JSON.parse(data.slice(6));
					continue;
				}
				const { value, done } = await reader.read();
				if (done) throw new Error('stream ended');
				buffer += decoder.decode(value);
			}
		};
		const first = await nextSnapshot();
		assert.equal(first.participant, null);
		await t.pollAll();
		const second = await nextSnapshot();
		assert.ok(second.version > first.version);
		await reader.cancel();
	} finally {
		await t.close();
	}
});

test('mock controls are refused outside mock mode', async () => {
	const t = await start({ withMock: false });
	try {
		assert.equal((await t.post('/api/mock/outage', { down: true })).status, 403);
	} finally {
		await t.close();
	}
});

test('static files are served; path traversal is not', async () => {
	const t = await start();
	try {
		const js = await fetch(`${t.base}/shared/countdown.js`);
		assert.equal(js.status, 200);
		assert.match(js.headers.get('content-type') ?? '', /javascript/);
		assert.equal((await fetch(`${t.base}/shared/%2e%2e%2f%2e%2e%2fconfig.example.json`)).status, 404);
		assert.equal((await fetch(`${t.base}/nope`)).status, 404);
		const font = await fetch(`${t.base}/fonts/inter-latin-wght-normal.woff2`);
		assert.equal(font.status, 200);
		await font.arrayBuffer();
	} finally {
		await t.close();
	}
});
