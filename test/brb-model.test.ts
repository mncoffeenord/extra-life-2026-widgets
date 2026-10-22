import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brbView, goalText, latestDonation, meterSlots, MOCK_VIEW, sceneClock, splitTeamName } from '../public/shared/brb-model.js';
import type { Snapshot } from '../public/shared/live.js';

const donation = (id: string, createdAt: string, donorName: string | null = 'Sam K.', amount: number | null = 25) => ({
	id, donorName, amount, createdAt, participantId: 1, recipientName: null, message: null,
});

function snap(over: Partial<Snapshot> = {}): Snapshot {
	return {
		version: 1, serverNow: 0, mode: 'mock',
		event: { startMs: 0, endMs: 0, timeZone: 'America/Chicago' },
		participant: { id: 1, name: 'Me', raised: 1250, goal: 2000, numDonations: 3 },
		team: { name: 'GamePlan42', raised: 3250, goal: 5000, numDonations: 9 },
		donations: { participant: [donation('a', '2026-11-12T19:00:00Z')], team: [donation('b', '2026-11-12T20:00:00Z', null, 10.5)] },
		ownParticipantId: 1,
		rotation: { intervalMs: 45000, unknownDonorName: 'Mysterious Hero', privateAmountText: 'Private donation' },
		...over,
	};
}

test('meter: floor, one always lit, all only at 100%', () => {
	assert.equal(meterSlots(3250, 5000, 20), 13); // 6.5 hearts
	assert.equal(meterSlots(1250, 2000, 40), 25);
	assert.equal(meterSlots(1500, 5000, 10), 3); // 10 * 0.3 must not round down to 2
	assert.equal(meterSlots(0, 5000, 20), 1); // half a heart at $0
	assert.equal(meterSlots(1, 5000, 40), 1);
	assert.equal(meterSlots(4999.99, 5000, 20), 19); // 99.99%: not full
	assert.equal(meterSlots(1999, 2000, 40), 39);
	assert.equal(meterSlots(5000, 5000, 20), 20);
	assert.equal(meterSlots(9000, 5000, 40), 40);
	assert.equal(meterSlots(100, 0, 20), 1);
	assert.equal(meterSlots(Number.NaN, 5000, 20), 1);
	assert.equal(meterSlots(-5, 5000, 20), 1);
});

test('clock: DD:HH:MM over 48 h, HH:MM under, then GAME TIME counting up from the start', () => {
	const start = Date.UTC(2026, 10, 12, 19, 0); // 1 PM Central, Nov 12
	const h = 3_600_000;
	const m = 60_000;
	assert.deepEqual(sceneClock(start - (21 * 24 + 4) * h - 15 * m, start), { time: '21:04:15', before: '', after: 'UNTIL GAME DAY' });
	assert.deepEqual(sceneClock(start - 48 * h - 1, start), { time: '02:00:01', before: '', after: 'UNTIL GAME DAY' });
	assert.deepEqual(sceneClock(start - 48 * h, start), { time: '48:00', before: '', after: 'UNTIL GAME DAY' });
	assert.deepEqual(sceneClock(start - 2 * h - 14 * m - 30_000, start), { time: '02:15', before: '', after: 'UNTIL GAME DAY' }); // rounds up
	assert.deepEqual(sceneClock(start - 1000, start), { time: '00:01', before: '', after: 'UNTIL GAME DAY' });
	assert.deepEqual(sceneClock(start, start), { time: '00:00', before: 'GAME TIME', after: '' });
	assert.deepEqual(sceneClock(start + 26 * h + 40 * m + 59_000, start), { time: '26:40', before: 'GAME TIME', after: '' });
	assert.deepEqual(sceneClock(start + 40 * h, start), { time: '40:00', before: 'GAME TIME', after: '' }); // past the end: keeps counting
	assert.equal(sceneClock(start, Number.NaN), null);
});

test('goal text keeps real numbers over goal and drops the target when missing', () => {
	assert.equal(goalText({ name: '', raised: 6200.75, goal: 5000, numDonations: 1 }), '$6,200 / $5,000');
	assert.equal(goalText({ name: '', raised: 40, goal: 0, numDonations: 1 }), '$40');
});

test('team name splits at the first digit', () => {
	assert.deepEqual(splitTeamName('GamePlan42'), { word: 'GAMEPLAN', number: '42' });
	assert.deepEqual(splitTeamName('Team Awesome'), { word: 'TEAM AWESOME', number: '' });
	assert.deepEqual(splitTeamName('Squad 7 Rules'), { word: 'SQUAD', number: '7 RULES' });
});

test('latest donation is the newest across my page and the team', () => {
	const d = latestDonation({ participant: [donation('a', '2026-11-12T19:00:00Z')], team: [donation('b', '2026-11-12T20:00:00Z'), donation('a', '2026-11-12T19:00:00Z')] });
	assert.equal(d?.id, 'b');
	assert.equal(latestDonation({ participant: [], team: [] }), null);
});

test('view: anonymous donor uses the configured name, uppercased; cents kept on the amount', () => {
	const v = brbView(snap());
	assert.deepEqual(v.latest, { id: 'b', name: 'MYSTERIOUS HERO', amount: 10.5 });
	assert.deepEqual(v.header, { word: 'GAMEPLAN', number: '42' });
	assert.deepEqual(v.team, { text: '$3,250 / $5,000', filled: 13 });
	assert.deepEqual(v.mine, { text: '$1,250 / $2,000', filled: 25 });
});

test('view: "be the first" only when the totals say there are no donations', () => {
	const empty = { participant: [], team: [] };
	const none = snap({ donations: empty, participant: { id: 1, name: 'Me', raised: 0, goal: 2000, numDonations: 0 }, team: { name: 'T', raised: 0, goal: 5000, numDonations: 0 } });
	assert.equal(brbView(none).latest, null);
	// totals say there are donations but the lists have not loaded: keep what is shown
	assert.equal(brbView(snap({ donations: empty })).latest, undefined);
	// nothing loaded at all
	const blank = brbView(snap({ participant: null, team: null, donations: empty }));
	assert.equal(blank.latest, undefined);
	assert.equal(blank.team, null);
	assert.equal(blank.mine, null);
});

test('mock view matches the design', () => {
	assert.equal(MOCK_VIEW.latest?.name, 'SAM K.');
	assert.equal(MOCK_VIEW.team?.filled, 13);
	assert.equal(MOCK_VIEW.mine?.filled, 25);
});
