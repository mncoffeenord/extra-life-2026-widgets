// @ts-check
// Be Right Back scene: a full 1920x1080 opaque page. Draws the approved design (2026 Asset Library,
// generator/scenes/scenes.py scene_BRB) as SVG and binds the donation card, team hearts and my-goal bar to the
// live snapshot, with a countdown / count-up clock in the header. ?mock=1 shows the design's mock data, ?demo=1 the
// same plus a sample donation every few seconds, ?still=1 stops the ambient animation and demo (screenshot test).
// In mock and demo mode, ?clock=game (or #game-time) shows the clock as during the event instead of before it.
// Donor names are drawn as glyph rectangles from a fixed table, so untrusted text never becomes markup.
import { amountText, brbView, goalText, meterSlots, MOCK_VIEW, MY_SEGMENTS, NO_DONATIONS_TEXT, sceneClock, TEAM_HALVES, TEAM_HEARTS } from '../../shared/brb-model.js';
import { connectLive, tween } from '../../shared/live.js';
import { fitPixelText, HEART, HEART_OUTLINED, normalizePixelText, pixelRuns, pixelWidth } from '../../shared/pixel-font.js';

/** @typedef {import('../../shared/brb-model.js').BrbView} BrbView */
/** @typedef {import('../../shared/brb-model.js').LatestView} LatestView */

const NAVY = '#16283A';
const GRID = '#1F3A52';
const BLUE = '#0E7CA2';
const YELLOW = '#FFCB05';
const DARK = '#253746';
const SKY = '#8FD0EE';
const SPARKLE = '#4FB5E0';
const MIST = '#E3F6FC';
const PANEL = '#0E2233';
const CARD = '#16293A';
const EMPTY_SEGMENT = '#183247';
const GROUND_ALT = '#2C4156';
const HIGHLIGHT = '#FFF3B0';
const WHITE = '#FFFFFF';
const BLACK = '#000';

const MARVIN_SRC = 'marvin.png';
const MARVIN_ASPECT = 1760 / 2183;

/** Star positions from the design (Python random.seed(7) in scene_BRB), so the sky looks the same every time. */
const STARS = [[1242, 92], [1818, 104], [144, 152], [1764, 206], [714, 986], [1800, 914], [210, 968], [1824, 716], [1794, 476], [912, 950], [96, 728], [276, 272], [1836, 296], [42, 242], [1164, 956], [30, 890], [1878, 578], [1482, 206], [96, 332], [114, 62], [1644, 230], [1818, 812], [1596, 44], [1482, 968], [1026, 956], [402, 254], [84, 536], [1380, 44], [1614, 974], [504, 932], [84, 980], [342, 98], [360, 974], [162, 422], [228, 56], [102, 638], [1872, 386], [36, 446], [1344, 974], [1752, 572], [150, 866], [1758, 386], [1614, 134], [1368, 134]];
const CLOUD = ['......XXXX........', '....XXXXXXXX..XX..', '..XXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXX', 'XXXXXXXXXXXXXXXXXXX'];

// Content column and card geometry (design pixels).
const COL_LEFT = 720;
const COL_RIGHT = 1680;
const NAME_X = 744;
const NAME_Y = 456;
const AMOUNT_RIGHT = 1648;
const NAME_GAP = 40;
const STEP_MS = 150;
// Header strip: 66px tall (2px taller than the first design, owner 2026-10-22), text centered in it.
const STRIP_Y = 300;
const STRIP_H = 66;
const STRIP_RIGHT = 1684;
/** Room kept for the widest clock ("DD:HH:MM UNTIL GAME DAY") so a long team name never runs into it. */
const CLOCK_ROOM = 640;
/** Mock and demo clock: this far before the start, counting down from page load. */
const MOCK_CLOCK_LEAD_MS = ((21 * 24 + 4) * 60 + 15) * 60_000;
/** Mock and demo clock with ?clock=game: this far into the event, counting up. */
const MOCK_GAME_ELAPSED_MS = (7 * 60 + 42) * 60_000;
/** Gap between a clock label and the time. */
const CLOCK_GAP = 18;

const params = new URLSearchParams(location.search);
const flag = (/** @type {string} */ name) => params.has(name) && params.get(name) !== '0';
const demo = flag('demo');
const mock = demo || flag('mock');
const mockGameTime = params.get('clock') === 'game' || location.hash === '#game-time';
if (flag('still')) document.documentElement.classList.add('still');

// ---------- SVG helpers ----------

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {Element[]} [children]
 */
function svg(tag, attrs = {}, children = []) {
	const node = document.createElementNS(NS, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	node.append(...children);
	return node;
}

/**
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} [fill] @param {Record<string, string | number>} [extra]
 */
function rect(x, y, w, h, fill, extra = {}) {
	return svg('rect', fill ? { x, y, width: w, height: h, fill, ...extra } : { x, y, width: w, height: h, ...extra });
}

/** @param {Element[]} children @param {Record<string, string | number>} [attrs] */
function crisp(children, attrs = {}) {
	return svg('g', { 'shape-rendering': 'crispEdges', ...attrs }, children);
}

/**
 * Pixel lettering with an optional drop shadow (`so` offset) and outline pass (`ow`), like the generator's pix().
 * @param {string} text normalized text
 * @param {number} px @param {number} x @param {number} y @param {string} fill
 * @param {{ shadow?: string, so?: number, ow?: number }} [opts]
 */
function pixelText(text, px, x, y, fill, { shadow, so = Math.max(2, Math.round(px * 0.7)), ow = 0 } = {}) {
	/** @type {Element[]} */
	const passes = [];
	/** @param {number} ox @param {number} oy @param {string} color @param {number} stroke */
	const pass = (ox, oy, color, stroke) => {
		/** @type {Record<string, string | number>} */
		const attrs = stroke ? { fill: color, stroke: color, 'stroke-width': stroke * 2, 'stroke-linejoin': 'round' } : { fill: color };
		passes.push(svg('g', attrs, pixelRuns(text, px, x + ox, y + oy).map((r) => rect(r.x, r.y, r.w, r.h))));
	};
	if (shadow) {
		pass(so, so, shadow, ow);
		if (ow) pass(0, 0, shadow, ow);
	}
	pass(0, 0, fill, 0);
	return crisp(passes);
}

/** @param {string} text @param {number} px @param {number} cx @param {number} y @param {string} fill @param {{ shadow?: string, so?: number, ow?: number }} opts */
function centeredText(text, px, cx, y, fill, opts) {
	return pixelText(text, px, cx - Math.floor(pixelWidth(text, px) / 2), y, fill, opts);
}

/** Top y that centers text of cell size `px` (plus its shadow `so`) in the header strip. @param {number} px @param {number} so */
function stripTop(px, so) {
	return STRIP_Y + Math.round((STRIP_H - (7 * px + so)) / 2);
}

/** @param {Element} node @param {number} cx @param {number} cy */
function tilt(node, cx, cy) {
	return svg('g', { transform: `translate(${cx} ${cy}) skewX(-8) translate(${-cx} ${-cy})` }, [node]);
}

/** @param {number} x @param {number} y @param {number} px @param {string} fill */
function smallHeart(x, y, px, fill) {
	/** @type {Element[]} */
	const cells = [];
	HEART.forEach((row, ri) => [...row].forEach((ch, ci) => ch === 'X' && cells.push(rect(x + ci * px, y + ri * px, px, px, fill))));
	return crisp(cells);
}

/**
 * Outlined heart container whose left and right halves fill separately (the center column belongs to the left,
 * as in the generator's half heart).
 * @param {number} x @param {number} y @param {number} px
 */
function heartContainer(x, y, px) {
	/** @type {Element[]} */
	const cells = [];
	/** @type {{ cell: Element, left: boolean, shine: boolean }[]} */
	const fills = [];
	HEART_OUTLINED.forEach((row, ri) =>
		[...row].forEach((ch, ci) => {
			if (ch === '.') return;
			const cell = rect(x + ci * px, y + ri * px, px, px, ch === 'O' ? DARK : PANEL);
			cells.push(cell);
			if (ch !== 'O') fills.push({ cell, left: ci <= 4, shine: ch === 'h' });
		}),
	);
	return {
		node: crisp(cells),
		/** @param {boolean} left @param {boolean} right */
		set(left, right) {
			for (const f of fills) f.cell.setAttribute('fill', (f.left ? left : right) ? (f.shine ? HIGHLIGHT : YELLOW) : PANEL);
		},
	};
}

/** @param {number} x @param {number} y @param {number} px */
function cloud(x, y, px) {
	/** @type {Element[]} */
	const cells = [];
	CLOUD.forEach((row, ri) => [...row].forEach((ch, ci) => ch === 'X' && cells.push(rect(x + ci * px, y + ri * px, px, px, ri === CLOUD.length - 1 ? MIST : WHITE))));
	return crisp(cells);
}

/** @param {number} x @param {number} y @param {number} i */
function star(x, y, i) {
	if (i % 3 === 0) {
		const px = 6;
		return crisp([rect(x, y - px, px, px, SKY), rect(x - px, y, px, px, SKY), rect(x, y, px, px, SKY), rect(x + px, y, px, px, SKY), rect(x, y + px, px, px, SKY)], { fill: SKY, opacity: 0.75 });
	}
	return i % 3 === 1 ? crisp([rect(x, y, 9, 9, SPARKLE)]) : crisp([rect(x, y, 6, 6, WHITE)]);
}

// ---------- static layers ----------

const scene = svg('svg', { viewBox: '0 0 1920 1080', class: 'scene' });

scene.append(rect(0, 0, 1920, 1080, NAVY));
const grid = svg('g', { stroke: GRID, 'stroke-width': 2 });
for (let x = 0; x < 1920; x += 60) grid.append(svg('line', { x1: x, y1: 0, x2: x, y2: 1080 }));
for (let y = 0; y < 1080; y += 60) grid.append(svg('line', { x1: 0, y1: y, x2: 1920, y2: y }));
scene.append(grid);

// Stars: every 4th one twinkles (two frames), each on its own cycle so only a few change at a time.
STARS.forEach(([x, y], i) => {
	const node = star(/** @type {number} */ (x), /** @type {number} */ (y), i);
	if (i % 4 !== 1) return scene.append(node);
	const wrap = svg('g', { class: 'twinkle' }, [node]);
	wrap.style.animationDuration = `${5 + (i % 5)}s`;
	wrap.style.animationDelay = `${-((i * 1.7) % 7).toFixed(1)}s`;
	scene.append(wrap);
});

// Top plate
scene.append(rect(480, 34, 960, 100, YELLOW, { rx: 12 }), rect(488, 42, 944, 84, DARK, { rx: 8 }));
scene.append(tilt(centeredText('EXTRA LIFE 2026', 8, 960, 60, YELLOW, { shadow: BLACK, so: 4 }), 960, 84));
scene.append(smallHeart(515, 60, 7, YELLOW), smallHeart(1375, 60, 7, YELLOW));

// Title
scene.append(tilt(centeredText('BE RIGHT BACK', 13, 960, 168, WHITE, { shadow: BLUE, so: 7, ow: 3 }), 960, 210));

// Panel
scene.append(
	rect(188, 288, 1544, 624, YELLOW, { rx: 10 }),
	rect(196, 296, 1528, 608, DARK, { rx: 6 }),
	rect(200, 300, 1520, 600, PANEL, { rx: 4 }),
	rect(200, STRIP_Y, 1520, STRIP_H, BLUE),
);
const headerLayer = svg('g');
const clockLayer = svg('g');
scene.append(headerLayer, clockLayer);

const marvinH = 430;
const marvinW = marvinH * MARVIN_ASPECT;
const marvin = svg('image', { href: MARVIN_SRC, x: 250, y: 395, width: marvinW, height: marvinH, transform: `rotate(-4 ${250 + marvinW / 2} ${395 + marvinH / 2})` });
scene.append(svg('g', { class: 'bob' }, [marvin]));

// Latest donation card
const cardBorder = rect(712, 392, 976, 140, DARK, { rx: 6, class: 'card-border' });
scene.append(cardBorder, rect(718, 398, 964, 128, CARD, { rx: 4 }));
scene.append(pixelText('LATEST DONATION', 5, NAME_X, 412, SKY));
const nameLayer = svg('g');
const amountLayer = svg('g');
scene.append(nameLayer, amountLayer);

// Team goal
scene.append(pixelText('TEAM GOAL', 6, COL_LEFT, 590, WHITE, { shadow: DARK, so: 3 }));
const teamTextLayer = svg('g');
scene.append(teamTextLayer);
const hearts = Array.from({ length: TEAM_HEARTS }, (_, i) => heartContainer(COL_LEFT + i * 96, 646, 9));
for (const h of hearts) scene.append(h.node);

// My goal
scene.append(pixelText('MY GOAL', 6, COL_LEFT, 760, WHITE, { shadow: DARK, so: 3 }));
const myTextLayer = svg('g');
scene.append(myTextLayer);
scene.append(rect(712, 812, 970, 52, DARK));
const segments = Array.from({ length: MY_SEGMENTS }, (_, i) => rect(COL_LEFT + i * 24, 820, 19, 36, EMPTY_SEGMENT));
scene.append(crisp(segments));

// Clouds and ground
scene.append(svg('g', { class: 'drift' }, [cloud(60, 930, 12)]), svg('g', { class: 'drift reverse' }, [cloud(1560, 950, 12)]));
/** @type {Element[]} */
const ground = [rect(0, 1010, 1920, 20, BLUE), rect(0, 1030, 1920, 50, DARK)];
for (let cx = 1; cx < 96; cx += 2) ground.push(rect(cx * 20, 1030, 20, 50, GROUND_ALT));
scene.append(crisp(ground));

document.body.append(scene);

// ---------- dynamic layers ----------

/** @param {{ word: string, number: string } | null} header */
function renderHeader(header) {
	if (!header) return headerLayer.replaceChildren();
	const { word, number } = header;
	const maxW = STRIP_RIGHT - CLOCK_ROOM - 236;
	const gap = number && word ? 22 : 0;
	let px = 7;
	while (px > 4 && pixelWidth(word, px) + gap + pixelWidth(number, px) > maxW) px--;
	const fitted = fitPixelText(word, maxW - gap - pixelWidth(number, px), px, px).text;
	const y = stripTop(px, 3);
	headerLayer.replaceChildren(
		pixelText(fitted, px, 236, y, WHITE, { shadow: DARK, so: 3 }),
		pixelText(number, px, 236 + pixelWidth(fitted, px) + gap, y, YELLOW, { shadow: DARK, so: 3 }),
	);
}

/** Right-aligned yellow amounts on a goal label row; shrinks rather than collide with the label. @param {Element} layer @param {string} text @param {number} y */
function renderGoalText(layer, text, y) {
	const t = normalizePixelText(text);
	let px = 6;
	while (px > 4 && COL_RIGHT - pixelWidth(t, px) < COL_LEFT + 340) px--;
	layer.replaceChildren(pixelText(t, px, COL_RIGHT - pixelWidth(t, px), y + Math.round((42 - 7 * px) / 2), YELLOW, { shadow: BLACK, so: 3 }));
}

/**
 * Fills `paint(i, on)` slots one at a time when the count goes up (if animating), instantly otherwise.
 * @param {(i: number, on: boolean) => void} paint
 */
function createStepper(paint) {
	let shown = 0;
	let timer = 0;
	return {
		/** @param {number} n @param {boolean} animate */
		set(n, animate) {
			clearInterval(timer);
			if (!animate || n <= shown) {
				for (let i = Math.min(n, shown); i < Math.max(n, shown); i++) paint(i, i < n);
				shown = n;
				return;
			}
			timer = window.setInterval(() => {
				paint(shown, true);
				shown++;
				if (shown >= n) clearInterval(timer);
			}, STEP_MS);
		},
	};
}
/** Lit half hearts, painted heart by heart. */
const halves = Array.from({ length: TEAM_HALVES }, () => false);
const heartStepper = createStepper((i, on) => {
	halves[i] = on;
	const h = Math.floor(i / 2);
	hearts[h]?.set(halves[2 * h] ?? false, halves[2 * h + 1] ?? false);
});
const segmentStepper = createStepper((i, on) => segments[i]?.setAttribute('fill', on ? YELLOW : EMPTY_SEGMENT));

/** @param {string} text */
function drawAmount(text) {
	if (!text) return amountLayer.replaceChildren();
	amountLayer.replaceChildren(pixelText(text, 9, AMOUNT_RIGHT - pixelWidth(text, 9), NAME_Y, YELLOW, { shadow: BLACK, so: 4 }));
}

/** @param {string} name @param {string} amount final amount text (sets the room for the name) */
function drawName(name, amount) {
	const right = amount ? AMOUNT_RIGHT - pixelWidth(amount, 9) - NAME_GAP : AMOUNT_RIGHT;
	const fit = fitPixelText(name, right - NAME_X, 9, 6);
	const y = NAME_Y + Math.round((63 - 7 * fit.px) / 2);
	nameLayer.replaceChildren(pixelText(fit.text, fit.px, NAME_X, y, WHITE, { shadow: DARK, so: fit.px >= 8 ? 4 : 3 }));
}

function flashCard() {
	cardBorder.classList.remove('flash');
	void cardBorder.getBoundingClientRect(); // restart the animation
	cardBorder.classList.add('flash');
}

/** @type {string | undefined} */
let latestKey;
/** @type {string | null | undefined} */
let latestId;
let cancelCount = () => {};

/** @param {LatestView | null | undefined} latest @param {boolean} animate */
function renderLatest(latest, animate) {
	if (latest === undefined) return; // donations not loaded yet: keep what is shown
	const key = latest ? `${latest.id}|${latest.name}|${latest.amount}` : '';
	if (key === latestKey) return;
	const isNew = animate && latestKey !== undefined && latest !== null && latest.id !== latestId;
	latestKey = key;
	latestId = latest?.id ?? null;
	cancelCount();
	if (!latest) {
		drawName(normalizePixelText(NO_DONATIONS_TEXT), '');
		drawAmount('');
		return;
	}
	const amount = amountText(latest.amount);
	drawName(latest.name, amount);
	if (isNew) flashCard();
	if (isNew && typeof latest.amount === 'number' && latest.amount > 0) {
		const final = latest.amount;
		cancelCount = tween(0, final, 1000, (v) => drawAmount(v >= final ? amount : amountText(Math.floor(v))));
	} else {
		drawAmount(amount);
	}
}

let clockKey = '';
/** Right-aligned in the strip: [before label] TIME [after label]. @param {{ time: string, before: string, after: string } | null} clock */
function renderClock(clock) {
	const key = clock ? `${clock.before}|${clock.time}|${clock.after}` : '';
	if (key === clockKey) return;
	clockKey = key;
	if (!clock) return clockLayer.replaceChildren();
	const time = normalizePixelText(clock.time);
	const before = normalizePixelText(clock.before);
	const after = normalizePixelText(clock.after);
	/** @type {Element[]} */
	const parts = [];
	let right = STRIP_RIGHT;
	/** @param {string} label */
	const addLabel = (label) => {
		const w = pixelWidth(label, 4);
		parts.push(pixelText(label, 4, right - w, stripTop(4, 2), WHITE, { shadow: DARK, so: 2 }));
		right -= w + CLOCK_GAP;
	};
	if (after) addLabel(after);
	const timeW = pixelWidth(time, 6);
	parts.push(pixelText(time, 6, right - timeW, stripTop(6, 3), YELLOW, { shadow: DARK, so: 3 }));
	right -= timeW + CLOCK_GAP;
	if (before) addLabel(before);
	clockLayer.replaceChildren(...parts);
}

/** Tick the header clock once a second against `now()` (the server's clock in live mode). @param {() => number} now @param {() => number | null} startMs */
function runClock(now, startMs) {
	const tick = () => {
		const start = startMs();
		renderClock(start === null ? null : sceneClock(now(), start));
	};
	tick();
	setInterval(tick, 1000);
}

let headerKey = '';
/** @type {Record<string, string>} */
const goalTextShown = {};

/** @param {BrbView} view @param {boolean} animate */
function apply(view, animate) {
	const hk = view.header ? `${view.header.word}|${view.header.number}` : '';
	if (view.header && hk !== headerKey) {
		headerKey = hk;
		renderHeader(view.header);
	}
	renderLatest(view.latest, animate);
	if (view.team) {
		if (goalTextShown.team !== view.team.text) renderGoalText(teamTextLayer, (goalTextShown.team = view.team.text), 590);
		heartStepper.set(view.team.filled, animate);
	}
	if (view.mine) {
		if (goalTextShown.mine !== view.mine.text) renderGoalText(myTextLayer, (goalTextShown.mine = view.mine.text), 760);
		segmentStepper.set(view.mine.filled, animate);
	}
}

// One half heart and one segment are always lit, even before data arrives.
heartStepper.set(1, false);
segmentStepper.set(1, false);

if (mock) {
	apply(MOCK_VIEW, false);
	const mockStart = mockGameTime ? Date.now() - MOCK_GAME_ELAPSED_MS : Date.now() + MOCK_CLOCK_LEAD_MS;
	runClock(() => Date.now(), () => mockStart);
	if (demo && !document.documentElement.classList.contains('still')) runDemo();
} else {
	// placeholders until the first snapshot (never blank)
	renderGoalText(teamTextLayer, '$0', 590);
	renderGoalText(myTextLayer, '$0', 760);
	let first = true;
	/** @type {number | null} */
	let startMs = null;
	const live = connectLive((s) => {
		startMs = s.event?.startMs ?? null;
		apply(brbView(s), !first);
		first = false;
	});
	runClock(live.now, () => startMs);
}

/** ?demo=1: a sample donation every 7 s so the flash, count-up and fills can be seen without a server. */
function runDemo() {
	/** @type {[string | null, number][]} */
	const samples = [
		['Pixel Paladin', 25], [null, 50], ['Jordan & Riley', 100], ['Zoë O’Brien', 10], ['The Very Generous Grandma Of The North', 250],
		['Speedrunner42', 42], [null, 5.5], ['Coach K.', 500], ['Team Snack Fund', 75], ['Sam K.', 25],
	];
	const start = { team: 3250, mine: 1250 };
	const goals = { team: 5000, mine: 2000 };
	let totals = { ...start };
	let n = 0;
	setInterval(() => {
		const [name, amount] = /** @type {[string | null, number]} */ (samples[n % samples.length]);
		n++;
		if (totals.team >= goals.team + 500) totals = { ...start };
		totals.team += amount;
		if (n % 2) totals.mine += amount;
		apply({
			header: MOCK_VIEW.header,
			latest: { id: `demo-${n}`, name: normalizePixelText(name ?? 'Mysterious Hero'), amount },
			team: { text: goalText({ name: '', raised: totals.team, goal: goals.team, numDonations: n }), filled: meterSlots(totals.team, goals.team, TEAM_HALVES) },
			mine: { text: goalText({ name: '', raised: totals.mine, goal: goals.mine, numDonations: n }), filled: meterSlots(totals.mine, goals.mine, MY_SEGMENTS) },
		}, true);
	}, 7000);
}
