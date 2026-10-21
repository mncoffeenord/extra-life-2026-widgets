import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DonationRotation } from '../public/shared/rotation.js';
import { parseDonations } from '../src/extralife/parse.ts';
import { fixture } from './helpers.ts';

const ME = 1;
let seq = 0;
function don(participantId: number | null, minute: number, extra: Partial<{ id: string; donorName: string | null; amount: number | null }> = {}) {
	return {
		id: extra.id ?? `D${++seq}`,
		donorName: 'donorName' in extra ? extra.donorName! : `Donor ${seq}`,
		amount: 'amount' in extra ? extra.amount! : 10,
		createdAt: new Date(Date.UTC(2026, 10, 12, 19, minute)).toISOString(),
		participantId,
		recipientName: participantId === ME ? 'Me' : 'Teammate',
	};
}
const ids = (items: Array<{ donation: { id: string } } | null>) => items.map((i) => i?.donation.id ?? null);

test('alternates mine / team round-robin and wraps each list', () => {
	const r = new DonationRotation({ ownParticipantId: ME });
	const m1 = don(ME, 5, { id: 'm1' }), m2 = don(ME, 4, { id: 'm2' });
	const t1 = don(2, 3, { id: 't1' });
	r.update([m1, m2], [m1, t1, m2]);
	assert.deepEqual(ids([r.next(), r.next(), r.next(), r.next(), r.next()]), ['m1', 't1', 'm2', 't1', 'm1']);
});

test('my own donations are not repeated in the team slot', () => {
	const r = new DonationRotation({ ownParticipantId: ME });
	const m1 = don(ME, 5, { id: 'm1' });
	r.update([m1], [m1]);
	assert.deepEqual(ids([r.next(), r.next()]), ['m1', 'm1']);
});

test('falls back to whichever list has donations; empty gives null', () => {
	const r = new DonationRotation({ ownParticipantId: ME });
	assert.equal(r.next(), null);
	r.update([], [don(2, 1, { id: 't1' }), don(3, 0, { id: 't2' })]);
	assert.deepEqual(ids([r.next(), r.next(), r.next()]), ['t1', 't2', 't1']);
});

test('the first update is a baseline; later new donations jump the queue in arrival order', () => {
	const r = new DonationRotation({ ownParticipantId: ME });
	const old = don(ME, 1, { id: 'old' });
	assert.deepEqual(r.update([old], []), []);
	const n1 = don(2, 2, { id: 'n1' }), n2 = don(ME, 3, { id: 'n2' });
	const fresh = r.update([n2, old], [n2, n1, old]);
	assert.deepEqual(ids(fresh), ['n1', 'n2']);
	const a = r.next(), b = r.next();
	assert.deepEqual(ids([a, b]), ['n1', 'n2']);
	assert.equal(a?.isNew, true);
	assert.equal(a?.source, 'team');
	assert.equal(b?.source, 'mine');
	assert.equal(r.next()?.isNew, false);
});

test('detects new donations even when the API list is capped at 100 (the 2022 bug)', () => {
	const r = new DonationRotation({ ownParticipantId: null });
	const page1 = parseDonations(fixture('sample-participant-donations'));
	r.update(page1, []);
	const newest = { ...page1[0]!, id: 'BRAND-NEW', createdAt: '2026-11-12T20:00:00.000Z' };
	const page2 = [newest, ...page1.slice(0, 99)]; // still exactly 100 items
	assert.equal(page2.length, page1.length);
	assert.deepEqual(ids(r.update(page2, [])), ['BRAND-NEW']);
});

test('cursor stays valid when a list shrinks', () => {
	const r = new DonationRotation({ ownParticipantId: ME });
	r.update([don(ME, 3, { id: 'a' }), don(ME, 2, { id: 'b' }), don(ME, 1, { id: 'c' })], []);
	r.next(); r.next(); r.next();
	r.update([don(ME, 3, { id: 'a' })], []);
	assert.equal(r.next()?.donation.id, 'a');
});
