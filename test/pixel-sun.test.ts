import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moonLayers, SUN_CENTER, sunLayers, sunRuns } from '../public/shared/pixel-sun.js';

test('sun layers are deterministic, in back-to-front order, with a bounded rect count', () => {
	const a = sunLayers();
	assert.deepEqual(a, sunLayers());
	assert.deepEqual(a.map((l) => l.name), ['halo', 'rays', 'orb', 'shade', 'highlight']);
	assert.deepEqual(a.map((l) => l.opacity), [0.3, 0.8, 1, 1, 1]);
	const total = a.reduce((n, l) => n + l.runs.length, 0);
	assert.ok(total > 100 && total < 1500, `${total} runs`);
	for (const l of a) assert.ok(l.runs.length > 0, `${l.name} is empty`);
});

test('runs are cell-aligned, merged per row, and cover only lit cells', () => {
	const cells = (cell: number, runs: { x: number, y: number, w: number, h: number }[]) => runs.reduce((n, r) => n + r.w / cell, 0);
	const orb = sunRuns(5, (dx, dy) => Math.hypot(dx, dy) < 80);
	for (const r of orb) {
		assert.equal(r.x % 5, 0);
		assert.equal(r.y % 5, 0);
		assert.equal(r.h, 5);
	}
	// one run per row for a disc
	assert.equal(new Set(orb.map((r) => r.y)).size, orb.length);
	// about pi * 80^2 / 25 cells (the handoff counts about 810 for the orb)
	assert.ok(Math.abs(cells(5, orb) - 804) < 20, `${cells(5, orb)} orb cells`);
	// the center cell is lit; a cell far outside is not
	const hit = (x: number, y: number) => orb.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
	assert.ok(hit(SUN_CENTER.x, SUN_CENTER.y));
	assert.ok(!hit(SUN_CENTER.x + 100, SUN_CENTER.y));
});

test('rays sit between the orb and their tips, at fine 2px cells', () => {
	const rays = sunLayers()[1]!;
	for (const r of rays.runs) {
		assert.equal(r.h, 2);
		const d = Math.hypot(r.x + 1 - SUN_CENTER.x, r.y + 1 - SUN_CENTER.y);
		assert.ok(d > 80 && d < 88 + 42 + 4, `ray cell at distance ${d}`);
	}
});

test('moon: deterministic layers, glow only outside the crescent, a C opening to the right', () => {
	const layers = moonLayers();
	assert.deepEqual(layers, moonLayers());
	assert.deepEqual(layers.map((l) => l.name), ['glowFar', 'glowNear', 'body', 'inner', 'rim', 'crater']);
	const byName = Object.fromEntries(layers.map((l) => [l.name, l.runs]));
	const covers = (runs: { x: number, y: number, w: number, h: number }[], x: number, y: number) => runs.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
	const cellsOf = (runs: { x: number, y: number, w: number, h: number }[]) => runs.flatMap((r) => Array.from({ length: r.w / 5 }, (_, i) => [r.x + i * 5 + 2, r.y + 2]));
	// the glow rings never overlap the lit crescent
	for (const [x = 0, y = 0] of [...cellsOf(byName.glowNear!), ...cellsOf(byName.glowFar!)]) assert.ok(!covers(byName.body!, x, y), `glow on the moon at ${x},${y}`);
	// lit on the left (thick side), dark in the middle-right (the cut)
	assert.ok(covers(byName.body!, SUN_CENTER.x - 60, SUN_CENTER.y));
	assert.ok(!covers(byName.body!, SUN_CENTER.x + 20, SUN_CENTER.y));
	const total = layers.reduce((n, l) => n + l.runs.length, 0);
	assert.ok(total > 50 && total < 800, `${total} runs`);
});
