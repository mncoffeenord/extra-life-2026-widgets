// @ts-check
// Ending scene ("Thanks for watching!"): the owner's final art (art-dark.svg / art-light.svg, made from the design
// pages by scripts/import-ending.ts) with one live element, the team goal value in the footer's bottom-right corner.
// Everything else is the design as-is. ?look=light picks the light art, ?mock=1 shows the design's sample value,
// ?demo=1 the same plus a sample donation every 7 s, ?still=1 stops the ambient motion (screenshot test).

import { endingValueText, ENDING_MOCK } from '../../shared/brb-model.js';
import { connectLive, tween } from '../../shared/live.js';
import { pixelRuns, pixelWidth } from '../../shared/pixel-font.js';

const NS = 'http://www.w3.org/2000/svg';
const look = document.documentElement.dataset.look === 'light' ? 'light' : 'dark';
const params = new URLSearchParams(location.search);
/** @param {string} name */
const flag = (name) => params.has(name) && params.get(name) !== '0';
const demo = flag('demo');
const mock = demo || flag('mock');

/**
 * The value as the design draws it (same in both looks): 5px cells, yellow with a dark navy drop shadow (offset 3)
 * and a 1px rounded outline, right edge at x 1770, top at y 995, tilted -8 degrees about (1770, 1013). It shrinks
 * to 4px rather than run into the logo (ends near x 1115).
 */
const VALUE = { right: 1770, top: 995, px: 5, minPx: 4, minLeft: 1150, fill: '#FFCB05', shadow: '#253746', so: 3, ow: 1 };

/** @param {string} tag @param {Record<string, string | number>} [attrs] @param {Element[]} [children] */
function svg(tag, attrs = {}, children = []) {
	const node = document.createElementNS(NS, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	node.append(...children);
	return node;
}

const valueLayer = svg('g', { transform: `translate(${VALUE.right} 1013) skewX(-8) translate(${-VALUE.right} -1013)` });

/** @param {string} text normalized text */
function drawValue(text) {
	let px = VALUE.px;
	while (px > VALUE.minPx && VALUE.right - pixelWidth(text, px) < VALUE.minLeft) px--;
	const x = VALUE.right - pixelWidth(text, px);
	const y = VALUE.top + Math.round((7 * (VALUE.px - px)) / 2);
	/** @param {number} ox @param {number} oy @param {Record<string, string | number>} attrs */
	const pass = (ox, oy, attrs) => svg('g', attrs, pixelRuns(text, px, x + ox, y + oy).map((r) => svg('rect', { x: r.x, y: r.y, width: r.w, height: r.h })));
	const outline = { fill: VALUE.shadow, stroke: VALUE.shadow, 'stroke-width': VALUE.ow * 2, 'stroke-linejoin': 'round' };
	valueLayer.replaceChildren(svg('g', { 'shape-rendering': 'crispEdges' }, [
		pass(VALUE.so, VALUE.so, outline),
		pass(0, 0, outline),
		pass(0, 0, { fill: VALUE.fill }),
	]));
}

let shownRaised = 0;
let shownGoal = 0;
let shownText = '';
let cancel = () => {};
/** Show the team total; counts up over 1.2 s when `animate` (a new donation), instantly otherwise. @param {number} raised @param {number} goal @param {boolean} animate */
function setValue(raised, goal, animate) {
	if (raised === shownRaised && goal === shownGoal && shownText) return;
	cancel();
	const from = shownRaised;
	shownRaised = raised;
	shownGoal = goal;
	const render = (/** @type {number} */ v) => {
		const text = endingValueText(v, goal);
		if (text !== shownText) drawValue((shownText = text));
	};
	cancel = animate && raised > from ? tween(from, raised, 1200, render) : (render(raised), () => {});
}

async function loadArt() {
	const res = await fetch(`art-${look}.svg`);
	const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
	const scene = document.importNode(doc.documentElement, true);
	scene.setAttribute('class', 'scene');
	scene.setAttribute('preserveAspectRatio', 'xMidYMid slice');
	scene.append(valueLayer);
	document.body.prepend(scene);
}

// never blank: a placeholder until the first snapshot
setValue(0, 0, false);
void loadArt();

if (mock) {
	setValue(ENDING_MOCK.raised, ENDING_MOCK.goal, false);
	if (demo && !document.documentElement.classList.contains('still')) {
		setInterval(() => setValue(shownRaised + 5 + Math.floor(Math.random() * 46), shownGoal, true), 7000);
	}
} else {
	let first = true;
	connectLive((s) => {
		if (!s.team) return;
		setValue(s.team.raised, s.team.goal, !first);
		first = false;
	});
}
