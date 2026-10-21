import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate, ParseError, parseDonations, parseParticipant, parseTeam } from '../src/extralife/parse.ts';
import { fixture } from './helpers.ts';

test('participant fixture (new page, no donations yet)', () => {
	const p = parseParticipant(fixture('participant'));
	assert.equal(typeof p.id, 'number');
	assert.equal(p.raised, 0);
	assert.equal(p.goal, 5000);
	assert.equal(p.numDonations, 0);
	assert.equal(p.teamName, 'GamePlan42');
	assert.equal(p.eventName, 'Extra Life 2026');
});

test('busy participant fixture', () => {
	const p = parseParticipant(fixture('sample-participant'));
	assert.ok(p.raised > 10000);
	assert.equal(p.numDonations, 298);
});

test('team fixture', () => {
	const t = parseTeam(fixture('team'));
	assert.equal(t.name, 'GamePlan42');
	assert.equal(t.goal, 14242);
	assert.equal(t.numParticipants, 5);
	assert.ok(t.raised >= 0);
});

test('team donations fixture: newest first, attributed to participants', () => {
	const d = parseDonations(fixture('team-donations'));
	assert.equal(d.length, 7);
	for (let i = 1; i < d.length; i++) assert.ok(d[i - 1]!.createdAt >= d[i]!.createdAt);
	assert.ok(d.every((x) => x.participantId !== null && x.amount !== null));
});

test('empty donations array', () => {
	assert.deepEqual(parseDonations(fixture('participant-donations')), []);
});

test('anonymous donors have no displayName in the API, parsed as null (not "Anonymous")', () => {
	const d = parseDonations(fixture('sample-participant-donations'));
	assert.equal(d.length, 100); // API page size cap, even though numDonations is 298
	const anonymous = d.filter((x) => x.donorName === null);
	assert.ok(anonymous.length > 0);
	assert.ok(d.every((x) => x.donorName !== 'Anonymous'));
});

test('dates with +0000 offsets normalize to ISO UTC', () => {
	assert.equal(normalizeDate('2026-10-18T22:36:29.937+0000'), '2026-10-18T22:36:29.937Z');
	assert.equal(normalizeDate('2026-08-20T23:59:09.47Z'), '2026-08-20T23:59:09.470Z');
	assert.equal(normalizeDate('garbage'), null);
	assert.equal(normalizeDate(undefined), null);
});

test('missing or non-numeric totals throw instead of producing NaN', () => {
	assert.throws(() => parseParticipant({ participantID: 1, displayName: 'x', sumDonations: '12' }), ParseError);
	assert.throws(() => parseTeam({}), ParseError);
	assert.throws(() => parseParticipant(null), ParseError);
	assert.throws(() => parseParticipant([]), ParseError);
});

test('missing goal defaults to 0 rather than failing', () => {
	assert.equal(parseTeam({ teamID: 1, name: 'T', sumDonations: 5 }).goal, 0);
});

test('malformed donation records are skipped, a non-array throws', () => {
	const d = parseDonations([{ donationID: 'A', createdDateUTC: '2026-11-12T19:00:00Z', amount: 5 }, { nope: true }, 42]);
	assert.equal(d.length, 1);
	assert.throws(() => parseDonations({}), ParseError);
});

test('hidden amount parses as null', () => {
	const [d] = parseDonations([{ donationID: 'A', createdDateUTC: '2026-11-12T19:00:00Z', displayName: 'Pat' }]);
	assert.equal(d!.amount, null);
	assert.equal(d!.donorName, 'Pat');
});
