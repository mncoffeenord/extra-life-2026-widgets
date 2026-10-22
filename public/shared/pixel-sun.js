// @ts-check
// The light Be Right Back scene's pixel sun, ported from scene_BRB_light() in the 2026 Asset Library generator
// (checkpoint 2026-10-22-be-right-back-light). Pure: returns rectangles; the scene draws them.
// Cells sit on a grid aligned to the canvas origin; a cell is lit when its center passes the layer's test.

export const SUN_CENTER = { x: 215, y: 140 };
/** Rays as (angle in degrees, length in px): irregular, so the sun doesn't read like a clock face. */
export const SUN_RAYS = [[8, 40], [40, 26], [70, 34], [101, 22], [131, 42], [160, 28], [190, 36], [221, 24], [250, 40], [281, 26], [311, 34], [341, 22]];
export const SUN_COLORS = { halo: '#FFF6C9', rays: '#FFD21F', orb: '#FFCB05', shade: '#F2B800', highlight: '#FFEE9A' };

const REACH = 170;
/** Python-style modulo (the generator's % floors; JavaScript's truncates). @param {number} a @param {number} n */
const mod = (a, n) => ((a % n) + n) % n;

/** @param {number} dx @param {number} dy */
function inRay(dx, dy) {
	const d = Math.hypot(dx, dy);
	const angle = mod(Math.atan2(dy, dx) * (180 / Math.PI), 360);
	const along = d - 88;
	for (const [a0 = 0, len = 0] of SUN_RAYS) {
		if (along < 0 || along > len) continue;
		const da = (mod(angle - a0 + 180, 360) - 180) * (Math.PI / 180);
		if (Math.abs(d * Math.sin(da)) < 0.2 * len * (1 - along / len) ** 0.65 + 0.4 && Math.abs(da) < 1.2) return true;
	}
	return false;
}

/**
 * Lit cells of one layer, merged into horizontal runs per row.
 * @param {number} cell cell size in px
 * @param {(dx: number, dy: number) => boolean} lit test on the cell center's offset from the sun's center
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function sunRuns(cell, lit) {
	const { x: cx, y: cy } = SUN_CENTER;
	const g0x = Math.floor((cx - REACH) / cell);
	const g1x = Math.floor((cx + REACH) / cell);
	const g0y = Math.floor((cy - REACH) / cell);
	const g1y = Math.floor((cy + REACH) / cell);
	/** @type {{ x: number, y: number, w: number, h: number }[]} */
	const runs = [];
	for (let gy = g0y; gy <= g1y; gy++) {
		let start = -1;
		for (let gx = g0x; gx <= g1x + 1; gx++) {
			const on = gx <= g1x && lit(gx * cell + cell / 2 - cx, gy * cell + cell / 2 - cy);
			if (on && start < 0) start = gx;
			if (!on && start >= 0) {
				runs.push({ x: start * cell, y: gy * cell, w: (gx - start) * cell, h: cell });
				start = -1;
			}
		}
	}
	return runs;
}

/**
 * The sun's layers, back to front.
 * @returns {{ name: keyof typeof SUN_COLORS, fill: string, opacity: number, runs: { x: number, y: number, w: number, h: number }[] }[]}
 */
export function sunLayers() {
	return [
		{ name: 'halo', fill: SUN_COLORS.halo, opacity: 0.3, runs: sunRuns(5, (dx, dy) => Math.hypot(dx, dy) < 108) },
		{ name: 'rays', fill: SUN_COLORS.rays, opacity: 0.8, runs: sunRuns(2, inRay) },
		{ name: 'orb', fill: SUN_COLORS.orb, opacity: 1, runs: sunRuns(5, (dx, dy) => Math.hypot(dx, dy) < 80) },
		{ name: 'shade', fill: SUN_COLORS.shade, opacity: 1, runs: sunRuns(5, (dx, dy) => { const h = Math.hypot(dx, dy); return h > 56 && h < 80 && dx + dy > 26; }) },
		{ name: 'highlight', fill: SUN_COLORS.highlight, opacity: 1, runs: sunRuns(5, (dx, dy) => Math.hypot(dx + 30, dy + 30) < 20) },
	];
}
