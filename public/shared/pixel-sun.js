// @ts-check
// The Be Right Back scene's sky objects, both centered top-left: the light look's pixel sun, ported from
// scene_BRB_light() in the 2026 Asset Library generator (checkpoint 2026-10-22-be-right-back-light), and the dark
// look's crescent moon (designed here, 2026-10-22). Pure: returns rectangles; the scene draws them.
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

export const MOON_COLORS = { glowNear: '#D6ECF2', glowFar: '#8FD0EE', body: '#FFF1BF', rim: '#FFFBE3', inner: '#F4DC8A', crater: '#E2D29C' };
/**
 * The crescent is a disc with a second disc cut out of it, offset to the right, so it reads as an upright "C" (a
 * diagonal crescent looked like a banana). Owner's references (2026-10-22): a full, bright crescent with soft grey
 * craters, in warm moonlight cream with a bright outer edge and a deeper inner edge, and a pale glow that follows
 * the crescent's outline (not a disc). The thinnest slivers at the tips are trimmed so the points stay clean.
 */
const MOON_R = 78;
const MOON_CUT = { x: 46, y: -8, r: 63 };
/** Clockwise tilt in degrees (top tip leans right, like the title's slant). */
const MOON_TILT_DEG = 8;
const TILT_COS = Math.cos(MOON_TILT_DEG * (Math.PI / 180));
const TILT_SIN = Math.sin(MOON_TILT_DEG * (Math.PI / 180));

/**
 * Wrap a test on the upright moon so it applies to the tilted one: rotate the cell offset back by the tilt first.
 * @param {(u: number, v: number) => boolean} test
 * @returns {(dx: number, dy: number) => boolean}
 */
const tilted = (test) => (dx, dy) => test(dx * TILT_COS + dy * TILT_SIN, -dx * TILT_SIN + dy * TILT_COS);
const MOON_MIN_WIDTH = 6;
const MOON_CRATERS = [[-48, 6, 10], [-28, 42, 7], [-38, -38, 6], [-62, 30, 5], [-12, 62, 4], [-60, -18, 4]];

/** Distances inside the outer edge and past the cut edge; lit when both are positive and the crescent isn't a sliver. @param {number} dx @param {number} dy */
function moonDepth(dx, dy) {
	const outside = MOON_R - Math.hypot(dx, dy);
	const pastCut = Math.hypot(dx - MOON_CUT.x, dy - MOON_CUT.y) - MOON_CUT.r;
	return { outside, pastCut, lit: outside > 0 && pastCut >= 0 && outside + pastCut >= MOON_MIN_WIDTH };
}

/** @param {number} dx @param {number} dy */
function inCrescent(dx, dy) {
	return moonDepth(dx, dy).lit;
}

const GLOW_DIRECTIONS = Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)]);

/**
 * True for points just outside the lit crescent, within `reach` px of it (sampled), so the glow hugs the real outline,
 * tips included.
 * @param {number} u @param {number} v @param {number} reach
 */
function nearCrescent(u, v, reach) {
	if (inCrescent(u, v)) return false;
	for (let r = 2.5; r <= reach; r += 2.5) {
		for (const [cx = 0, cy = 0] of GLOW_DIRECTIONS) if (inCrescent(u + cx * r, v + cy * r)) return true;
	}
	return false;
}

/**
 * The moon's layers, back to front: a pale blue glow in two fading rings hugging the outline (outer and inner curve),
 * the crescent, a deeper cream along the inner edge, a bright outer rim on the thick side, then craters.
 * @returns {{ name: keyof typeof MOON_COLORS, fill: string, opacity: number, runs: { x: number, y: number, w: number, h: number }[] }[]}
 */
export function moonLayers() {
	return [
		{ name: 'glowFar', fill: MOON_COLORS.glowFar, opacity: 0.24, runs: sunRuns(5, tilted((u, v) => nearCrescent(u, v, 12.5) && !nearCrescent(u, v, 5))) },
		{ name: 'glowNear', fill: MOON_COLORS.glowNear, opacity: 0.45, runs: sunRuns(5, tilted((u, v) => nearCrescent(u, v, 5))) },
		{ name: 'body', fill: MOON_COLORS.body, opacity: 1, runs: sunRuns(5, tilted(inCrescent)) },
		{ name: 'inner', fill: MOON_COLORS.inner, opacity: 1, runs: sunRuns(5, tilted((u, v) => { const m = moonDepth(u, v); return m.lit && m.pastCut < 8; })) },
		{ name: 'rim', fill: MOON_COLORS.rim, opacity: 1, runs: sunRuns(5, tilted((u, v) => { const m = moonDepth(u, v); return m.lit && m.outside < 8 && m.pastCut >= 8 && u < -10; })) },
		{ name: 'crater', fill: MOON_COLORS.crater, opacity: 1, runs: sunRuns(5, tilted((u, v) => inCrescent(u, v) && MOON_CRATERS.some(([x = 0, y = 0, r = 0]) => Math.hypot(u - x, v - y) < r))) },
	];
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
