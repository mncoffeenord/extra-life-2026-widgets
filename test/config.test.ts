import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ConfigError, parseConfig } from '../src/config.ts';

const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
const valid = () => {
	const c = structuredClone(example);
	c.extraLife.participantId = '581000';
	c.extraLife.teamId = 'MyTeam42';
	return c;
};

function problemsOf(fn: () => unknown): string[] {
	try {
		fn();
	} catch (err) {
		assert.ok(err instanceof ConfigError);
		return err.problems;
	}
	assert.fail('expected ConfigError');
}

test('example config with IDs filled in is valid and resolves event times', () => {
	const c = parseConfig(valid());
	assert.equal(c.event.startMs, Date.parse('2026-11-12T19:00:00Z'));
	assert.equal(c.event.endMs, Date.parse('2026-11-14T07:00:00Z'));
	assert.equal(c.extraLife.teamId, 'MyTeam42');
	assert.equal(c.mock, false);
});

test('placeholder IDs are rejected in live mode but allowed in mock mode', () => {
	const problems = problemsOf(() => parseConfig(example));
	assert.ok(problems.some((p) => p.includes('participantId is not set')));
	assert.ok(problems.some((p) => p.includes('teamId is not set')));
	assert.equal(parseConfig(example, { mock: true }).mock, true);
});

test('numeric IDs are accepted and normalized to strings', () => {
	const c = valid();
	c.extraLife.participantId = 581000;
	assert.equal(parseConfig(c).extraLife.participantId, '581000');
});

test('missing sections fall back to defaults', () => {
	const c = parseConfig({ extraLife: { participantId: '1', teamId: '2' }, event: { start: '2026-11-12T13:00', end: '2026-11-14T01:00' } });
	assert.equal(c.server.port, 4242);
	assert.equal(c.polling.participantSeconds, 15);
	assert.equal(c.rotation.intervalSeconds, 30);
	assert.equal(c.event.timeZone, 'America/Chicago');
});

test('collects every problem at once', () => {
	const c = valid();
	c.event.timeZone = 'Central';
	c.server.port = 'abc';
	c.polling.participantSeconds = 1;
	c.extraLife.teamId = 'bad id!';
	const problems = problemsOf(() => parseConfig(c));
	assert.equal(problems.length, 4, problems.join('\n'));
});

test('end before start, skipped DST time, and bad formats are reported', () => {
	const c = valid();
	c.event.end = '2026-11-12T12:00';
	assert.ok(problemsOf(() => parseConfig(c)).some((p) => p.includes('after event.start')));
	const d = valid();
	d.event.start = '2026-03-08T02:30';
	assert.ok(problemsOf(() => parseConfig(d)).some((p) => p.includes('does not exist')));
});

test('trailing slash on baseUrl is trimmed', () => {
	const c = valid();
	c.extraLife.baseUrl = 'https://dd.extra-life.org/api/';
	assert.equal(parseConfig(c).extraLife.baseUrl, 'https://dd.extra-life.org/api');
});
