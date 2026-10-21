import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockView, formatHoursMinutes, formatRemaining } from '../public/shared/countdown.js';
import { parseEventTime } from '../src/time.ts';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const start = parseEventTime('2026-11-12T13:00', 'America/Chicago');
const end = parseEventTime('2026-11-14T01:00', 'America/Chicago');

test('days view when a day or more remains', () => {
	assert.deepEqual(clockView(start - (2 * 24 * H + 4 * H + 12 * M), start, end), { phase: 'before', label: 'Starts in', primary: '2d 04h 12m', secondary: '' });
	assert.equal(formatRemaining(24 * H), '1d 00h 00m');
	assert.equal(formatRemaining(24 * H + 30 * S), '1d 00h 01m'); // minutes round up while counting down
});

test('HH:MM:SS view under 24 hours', () => {
	assert.equal(clockView(start - (23 * H + 59 * M + 59 * S), start, end).primary, '23:59:59');
	assert.equal(clockView(start - 90 * S, start, end).primary, '00:01:30');
	assert.equal(clockView(start - 400, start, end).primary, '00:00:01'); // never shows 00:00:00 before start
});

test('flips to Live exactly at start, elapsed of total', () => {
	assert.deepEqual(clockView(start, start, end), { phase: 'live', label: 'Live', primary: '00:00', secondary: 'of 36:00' });
	assert.equal(clockView(start + 7 * H + 42 * M + 59 * S, start, end).primary, '07:42'); // elapsed rounds down
	assert.equal(clockView(start + 25 * H + 10 * M, start, end).primary, '25:10'); // hours go past 24
	assert.equal(clockView(end - 1, start, end).primary, '35:59');
});

test('flips to Overtime exactly at end and counts up', () => {
	assert.deepEqual(clockView(end, start, end), { phase: 'overtime', label: 'Overtime', primary: '00:00', secondary: '' });
	assert.equal(clockView(end + 12 * M + 30 * S, start, end).primary, '00:12');
	assert.equal(clockView(end + 3 * H, start, end).primary, '03:00');
});

test('clock math is in absolute time, so the Nov 1 DST change does not shift it', () => {
	// Ten days out, counting across the fall-back night: wall clocks repeat an hour, the countdown does not.
	const before = Date.parse('2026-10-31T18:00:00Z'); // Oct 31 1 PM CDT: same wall time as the start
	assert.equal(clockView(before, start, end).primary, '12d 01h 00m'); // 12 days + the repeated hour
});

test('non-finite inputs never render NaN', () => {
	const v = clockView(Number.NaN, start, end);
	assert.ok(!v.primary.includes('NaN'));
});

test('formatHoursMinutes pads and floors', () => {
	assert.equal(formatHoursMinutes(0), '00:00');
	assert.equal(formatHoursMinutes(36 * H), '36:00');
	assert.equal(formatHoursMinutes(59 * S), '00:00');
});
