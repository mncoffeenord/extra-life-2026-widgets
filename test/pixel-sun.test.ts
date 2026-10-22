import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_CENTER, sunLayers, sunRuns } from '../public/shared/pixel-sun.js';

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
