import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExtraLifeClient, parseRetryAfter } from '../src/extralife/client.ts';
import { fakeFetch, fixture, jsonResponse, textResponse } from './helpers.ts';

function client(f: typeof fetch, timeoutMs = 1000) {
	return new ExtraLifeClient({ baseUrl: 'https://dd.extra-life.org/api', apiVersion: '1.6', timeoutMs, fetch: f, now: () => 0 });
}

test('builds versioned URLs and returns JSON with etag and num-records', async () => {
	const f = fakeFetch(jsonResponse(fixture('team-donations'), { headers: { etag: '"abc"', 'num-records': '7' } }));
	const r = await client(f.fetch).get('teams/74105/donations');
	assert.equal(f.calls[0]!.url, 'https://dd.extra-life.org/api/teams/74105/donations?version=1.6');
	assert.equal(r.kind, 'ok');
	if (r.kind === 'ok') {
		assert.equal(r.etag, '"abc"');
		assert.equal(r.numRecords, 7);
		assert.ok(Array.isArray(r.data));
	}
});

test('sends If-None-Match and handles 304', async () => {
	const f = fakeFetch(new Response(null, { status: 304 }));
	const r = await client(f.fetch).get('participants/1', '"etag1"');
	assert.equal(f.calls[0]!.headers['If-None-Match'], '"etag1"');
	assert.deepEqual(r, { kind: 'not-modified', etag: '"etag1"' });
});

test('404 comes back as text/html (seen live) and maps to not-found', async () => {
	const r = await client(fakeFetch(textResponse('Not Found', 404)).fetch).get('participants/999999999');
	assert.equal(r.kind, 'error');
	if (r.kind === 'error') assert.equal(r.reason, 'not-found');
});

test('401 "Rate limit exceeded." (seen live) maps to rate-limited', async () => {
	const r = await client(fakeFetch(textResponse('Rate limit exceeded.  ', 401, 'application/json;charset=utf-8')).fetch).get('teams');
	assert.equal(r.kind === 'error' && r.reason, 'rate-limited');
});

test('429 honors Retry-After', async () => {
	const res = textResponse('slow down', 429);
	res.headers.set('retry-after', '120');
	const r = await client(fakeFetch(res).fetch).get('participants/1');
	assert.equal(r.kind === 'error' && r.retryAfterMs, 120_000);
});

test('5xx maps to http error', async () => {
	const r = await client(fakeFetch(textResponse('oops', 503)).fetch).get('participants/1');
	assert.equal(r.kind === 'error' && r.reason, 'http');
	assert.equal(r.kind === 'error' && r.status, 503);
});

test('200 with HTML (e.g. a maintenance page) is a bad response, not a crash', async () => {
	const r = await client(fakeFetch(textResponse('<html>maintenance</html>', 200)).fetch).get('participants/1');
	assert.equal(r.kind === 'error' && r.reason, 'bad-response');
});

test('invalid JSON is a bad response', async () => {
	const r = await client(fakeFetch(textResponse('{"a":', 200, 'application/json')).fetch).get('participants/1');
	assert.equal(r.kind === 'error' && r.reason, 'bad-response');
});

test('network failure', async () => {
	const r = await client(fakeFetch(new TypeError('fetch failed')).fetch).get('participants/1');
	assert.equal(r.kind === 'error' && r.reason, 'network');
});

test('timeout aborts a hung request', async () => {
	const hang = fakeFetch((_call, init) => new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
	}));
	const r = await client(hang.fetch, 20).get('participants/1');
	assert.equal(r.kind === 'error' && r.reason, 'timeout');
});

test('parseRetryAfter handles seconds, HTTP dates, and junk', () => {
	assert.equal(parseRetryAfter('30', 0), 30_000);
	assert.equal(parseRetryAfter(new Date(90_000).toUTCString(), 0), 90_000);
	assert.equal(parseRetryAfter('soon', 0), null);
	assert.equal(parseRetryAfter(null, 0), null);
});
