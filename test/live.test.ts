import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tween } from '../public/shared/live.js';

test('tween never runs below its start value when a frame is timestamped before it began', () => {
	const g = globalThis as Record<string, unknown>;
	const saved = { document: g.document, requestAnimationFrame: g.requestAnimationFrame, cancelAnimationFrame: g.cancelAnimationFrame };
	const frames: Array<(t: number) => void> = [];
	g.document = { hidden: false };
	g.requestAnimationFrame = (cb: (t: number) => void) => frames.push(cb);
	g.cancelAnimationFrame = () => {};
	try {
		const seen: number[] = [];
		const cancel = tween(0, 25, 1000, (v) => seen.push(v));
		const start = performance.now();
		frames.shift()?.(start - 8); // rAF time is the frame start, which can precede the call
		frames.shift()?.(start + 500);
		frames.shift()?.(start + 1000);
		cancel();
		assert.ok(seen.every((v) => v >= 0), `values: ${seen.join(', ')}`);
		assert.equal(seen.at(-1), 25);
	} finally {
		Object.assign(g, saved);
	}
});
