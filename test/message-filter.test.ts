import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageFilter, DEFAULT_BLOCKED_WORDS, hideFlaggedMessages, normalizeWord } from '../src/message-filter.ts';
import { parseDonations } from '../src/extralife/parse.ts';

const flagged = createMessageFilter(DEFAULT_BLOCKED_WORDS);

test('clean messages pass', () => {
	for (const m of [
		'Go GamePlan42! So proud of you all 💙',
		'Have a great stream, stay hydrated!',
		'For the kids at Vanderbilt. Class act, everyone.',
		'Reading Dickens tonight, cockpit simulator next', // substrings of blocked words are fine
		'Assessment done, now donating',
	]) assert.equal(flagged(m), false, m);
});

test('blocked words are caught case-insensitively with punctuation around them', () => {
	assert.equal(flagged('What the FUCK, amazing run!'), true);
	assert.equal(flagged('holy shit!!!'), true);
	assert.equal(flagged('"bitch"'), true);
});

test('common evasions: leetspeak, stretched letters, accents, endings', () => {
	assert.equal(flagged('sh1t yeah'), true);
	assert.equal(flagged('fuuuuck'), true);
	assert.equal(flagged('fūck'), true);
	assert.equal(flagged('fucking legend'), true);
	assert.equal(flagged('bitches'), true);
	assert.equal(flagged('$hit'), true);
});

test('extra words from config are added', () => {
	const f = createMessageFilter([...DEFAULT_BLOCKED_WORDS, 'spoiler']);
	assert.equal(f('no spoilers please'), true);
	assert.equal(flagged('no spoilers please'), false);
});

test('normalizeWord squeezes repeats on both sides so double letters still match', () => {
	assert.equal(normalizeWord('Asshole'), normalizeWord('asssshole'));
	assert.equal(normalizeWord('B1TCH'), 'bitch');
});

test('hideFlaggedMessages keeps the donation but drops the message', () => {
	const [a, b] = hideFlaggedMessages(
		parseDonations([
			{ donationID: 'A', createdDateUTC: '2026-11-12T19:00:00Z', amount: 25, displayName: 'Pat', message: 'holy shit' },
			{ donationID: 'B', createdDateUTC: '2026-11-12T19:01:00Z', amount: 10, displayName: 'Lee', message: 'Go team!' },
		]),
		flagged,
	);
	assert.equal(b!.id, 'A');
	assert.equal(b!.message, null);
	assert.equal(b!.amount, 25);
	assert.equal(a!.message, 'Go team!');
});
