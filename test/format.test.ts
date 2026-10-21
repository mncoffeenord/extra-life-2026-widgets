import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountLabel, donorLabel, formatAmount, formatDollars, progress } from '../public/shared/format.js';

test('formatDollars: whole dollars, rounded down, never NaN', () => {
	assert.equal(formatDollars(1250), '$1,250');
	assert.equal(formatDollars(52525.64), '$52,525');
	assert.equal(formatDollars(0), '$0');
	assert.equal(formatDollars(undefined), '$0');
	assert.equal(formatDollars(Number.NaN), '$0');
	assert.equal(formatDollars('12'), '$0');
	assert.equal(formatDollars(-5), '$0');
});

test('formatAmount keeps cents only when present', () => {
	assert.equal(formatAmount(25), '$25');
	assert.equal(formatAmount(25.5), '$25.50');
	assert.equal(formatAmount(1000), '$1,000');
});

test('progress handles over-goal, zero goal, and bad input', () => {
	assert.equal(progress(1250, 2000), 0.625);
	assert.equal(progress(3000, 2000), 1.5);
	assert.equal(progress(100, 0), 0);
	assert.equal(progress(null, 2000), 0);
});

test('donor and amount labels fall back for anonymous / hidden donations', () => {
	assert.equal(donorLabel({ donorName: null }, 'Mysterious Hero'), 'Mysterious Hero');
	assert.equal(donorLabel({ donorName: '  ' }, 'Mysterious Hero'), 'Mysterious Hero');
	assert.equal(donorLabel({ donorName: 'Pat' }, 'Mysterious Hero'), 'Pat');
	assert.equal(amountLabel({ amount: null }, 'Private donation'), 'Private donation');
	assert.equal(amountLabel({ amount: 20 }, 'Private donation'), '$20');
});
