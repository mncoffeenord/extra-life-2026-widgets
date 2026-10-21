import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchResult } from '../src/extralife/client.ts';
import { parseParticipant } from '../src/extralife/parse.ts';
import { Poller } from '../src/poller.ts';
import { Store } from '../src/store.ts';
import { fixture } from './helpers.ts';

function setup(results: FetchResult[], { minGapMs = 2000, maxBackoffMs = 300_000 } = {}) {
	let now = 1_000_000;
	const calls: Array<{ path: string; etag: string | null }> = [];
	const store = new Store();
	const client = {
		async get(path: string, etag: string | null = null) {
			calls.push({ path, etag });
			const r = results.shift();
			if (!r) throw new Error('no more results');
			return r;
		},
	};
	const poller = new Poller({
		client,
		store,
		minGapMs,
		maxBackoffMs,
		now: () => now,
		random: () => 0.5, // jitter factor exactly 1.0
		log: () => {},
		resources: [
			{ key: 'participant', path: 'participants/1', intervalMs: 15_000, apply: (d) => store.setParticipant(parseParticipant(d)) },
			{ key: 'team', path: 'teams/2', intervalMs: 30_000, apply: () => {} },
		],
	});
	return { poller, store, calls, advance: (ms: number) => (now += ms), now: () => now };
}

const ok = (data: unknown, etag = '"e1"'): FetchResult => ({ kind: 'ok', data, etag, numRecords: null });
const fail = (reason: 'network' | 'rate-limited' = 'network', retryAfterMs: number | null = null): FetchResult => ({
	kind: 'error', reason, status: null, retryAfterMs, message: 'boom',
});

test('everything is due at start, but requests are spaced by minGap', async () => {
	const t = setup([ok(fixture('participant'))]);
	assert.deepEqual(t.poller.plan(), { key: 'participant', waitMs: 0 });
	await t.poller.poll('participant');
	assert.deepEqual(t.poller.plan(), { key: 'team', waitMs: 2000 });
});

test('a success schedules the next poll one interval later and sends the ETag next time', async () => {
	const t = setup([ok(fixture('participant'), '"v1"'), { kind: 'not-modified', etag: '"v1"' }]);
	await t.poller.poll('participant');
	assert.equal(t.poller.nextDueAt('participant'), t.now() + 15_000);
	t.advance(15_000);
	await t.poller.poll('participant');
	assert.deepEqual(t.calls[1], { path: 'participants/1', etag: '"v1"' });
	assert.equal(t.store.status.participant.lastError, null);
	assert.equal(t.store.data.participant?.goal, 5000);
});

test('failures back off exponentially, capped, and keep the last good value', async () => {
	const t = setup([ok(fixture('participant')), fail(), fail(), fail()], { maxBackoffMs: 100_000 });
	await t.poller.poll('participant');
	const good = t.store.data.participant;
	await t.poller.poll('participant');
	assert.equal(t.poller.nextDueAt('participant'), t.now() + 30_000); // 15s * 2^1
	await t.poller.poll('participant');
	assert.equal(t.poller.nextDueAt('participant'), t.now() + 60_000); // 15s * 2^2
	await t.poller.poll('participant');
	assert.equal(t.poller.nextDueAt('participant'), t.now() + 100_000); // capped
	assert.equal(t.store.status.participant.consecutiveFailures, 3);
	assert.deepEqual(t.store.data.participant, good);
});

test('Retry-After longer than the backoff wins', async () => {
	const t = setup([fail('rate-limited', 600_000)]);
	await t.poller.poll('participant');
	assert.equal(t.poller.nextDueAt('participant'), t.now() + 600_000);
});

test('recovery resets the failure count', async () => {
	const t = setup([fail(), ok(fixture('participant'))]);
	await t.poller.poll('participant');
	await t.poller.poll('participant');
	assert.equal(t.store.status.participant.consecutiveFailures, 0);
	assert.equal(t.poller.nextDueAt('participant'), t.now() + 15_000);
});

test('an unparseable 200 is a failure, keeps the old data, and drops the ETag', async () => {
	const t = setup([ok(fixture('participant'), '"good"'), ok({ sumDonations: 'NaN' }, '"bad"'), ok(fixture('participant'))]);
	await t.poller.poll('participant');
	await t.poller.poll('participant');
	assert.match(t.store.status.participant.lastError ?? '', /^parse:/);
	assert.equal(t.store.data.participant?.goal, 5000);
	await t.poller.poll('participant');
	assert.equal(t.calls[2]!.etag, null);
});

test('trigger makes a resource due immediately', async () => {
	const t = setup([ok({})]);
	await t.poller.poll('team');
	t.advance(5000);
	t.poller.trigger('team');
	assert.equal(t.poller.nextDueAt('team'), t.now());
});

test('store persists and reloads last-known-good data for the same IDs only', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'el-store-'));
	try {
		const file = join(dir, 'cache.json');
		const a = new Store({ cacheFile: file, cacheKey: '1/2' });
		a.setParticipant(parseParticipant(fixture('participant')));
		a.recordAttempt('participant', 123, null);
		a.save();
		const b = new Store({ cacheFile: file, cacheKey: '1/2' });
		assert.equal(b.load(), true);
		assert.equal(b.data.participant?.goal, 5000);
		assert.equal(b.status.participant.lastSuccessAt, 123);
		const c = new Store({ cacheFile: file, cacheKey: '9/9' });
		assert.equal(c.load(), false);
		assert.equal(c.data.participant, null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('store only bumps its version when data actually changes', () => {
	const s = new Store();
	let changes = 0;
	s.on('change', () => changes++);
	const p = parseParticipant(fixture('participant'));
	s.setParticipant(p);
	s.setParticipant({ ...p });
	assert.equal(changes, 1);
	s.setParticipant({ ...p, raised: 25 });
	assert.equal(changes, 2);
});
