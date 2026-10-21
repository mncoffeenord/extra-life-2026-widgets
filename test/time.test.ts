import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEventTime, zoneOffsetMs, zonedWallTimeToUtc } from '../src/time.ts';

const CHI = 'America/Chicago';
const H = 3_600_000;

test('event start 1 PM Nov 12 2026 Chicago is CST (UTC-6), not CDT', () => {
	assert.equal(parseEventTime('2026-11-12T13:00', CHI), Date.parse('2026-11-12T19:00:00Z'));
	assert.equal(zoneOffsetMs(Date.parse('2026-11-12T19:00:00Z'), CHI), -6 * H);
});

test('event end 1 AM Nov 14 2026 Chicago', () => {
	assert.equal(parseEventTime('2026-11-14T01:00', CHI), Date.parse('2026-11-14T07:00:00Z'));
});

test('36-hour event duration', () => {
	const start = parseEventTime('2026-11-12T13:00', CHI);
	const end = parseEventTime('2026-11-14T01:00', CHI);
	assert.equal(end - start, 36 * H);
});

test('the 2022 config style (fixed -05:00) would be an hour off in Nov 2026', () => {
	const fixed = parseEventTime('2026-11-12T13:00-05:00', CHI);
	assert.equal(parseEventTime('2026-11-12T13:00', CHI) - fixed, H);
});

test('explicit Z / offset strings are taken as exact instants', () => {
	assert.equal(parseEventTime('2026-11-12T19:00:00Z', CHI), Date.parse('2026-11-12T19:00:00Z'));
	assert.equal(parseEventTime('2026-11-12T13:00:00-0600', CHI), Date.parse('2026-11-12T19:00:00Z'));
});

test('summer wall time uses CDT (UTC-5)', () => {
	assert.equal(parseEventTime('2026-07-04T13:00', CHI), Date.parse('2026-07-04T18:00:00Z'));
});

test('DST end (Nov 1 2026): repeated 1:30 AM resolves to the first (CDT) occurrence', () => {
	const t = zonedWallTimeToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, CHI);
	assert.equal(t, Date.parse('2026-11-01T06:30:00Z'));
});

test('DST end: times either side of the transition', () => {
	assert.equal(parseEventTime('2026-11-01T00:59', CHI), Date.parse('2026-11-01T05:59:00Z'));
	assert.equal(parseEventTime('2026-11-01T02:00', CHI), Date.parse('2026-11-01T08:00:00Z'));
});

test('DST start (Mar 8 2026): skipped 2:30 AM throws', () => {
	assert.throws(() => parseEventTime('2026-03-08T02:30', CHI), /does not exist/);
	assert.equal(parseEventTime('2026-03-08T03:00', CHI), Date.parse('2026-03-08T08:00:00Z'));
});

test('other zones work (no hard-coded Chicago)', () => {
	assert.equal(parseEventTime('2026-11-12T13:00', 'America/New_York'), Date.parse('2026-11-12T18:00:00Z'));
	assert.equal(parseEventTime('2026-11-12T13:00', 'UTC'), Date.parse('2026-11-12T13:00:00Z'));
});

test('malformed and out-of-range inputs throw', () => {
	assert.throws(() => parseEventTime('Nov 12 1pm', CHI), /Expected/);
	assert.throws(() => parseEventTime('2026-13-01T10:00', CHI), /Out-of-range/);
	assert.throws(() => parseEventTime('2026-11-12T13:00+99:99x', CHI));
});
