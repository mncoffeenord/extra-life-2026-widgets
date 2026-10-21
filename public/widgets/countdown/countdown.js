// @ts-check
import { clockView } from '../../shared/countdown.js';
import { connectLive } from '../../shared/live.js';

const root = /** @type {HTMLElement} */ (document.querySelector('.countdown'));
const label = /** @type {HTMLElement} */ (document.getElementById('label'));
const primary = /** @type {HTMLElement} */ (document.getElementById('primary'));
const secondary = /** @type {HTMLElement} */ (document.getElementById('secondary'));

/** @type {{ startMs: number, endMs: number } | null} */
let event = null;

const live = connectLive((s) => {
	event = s.event;
	render();
});

function render() {
	if (!event) return;
	const view = clockView(live.now(), event.startMs, event.endMs);
	if (root.dataset.phase !== view.phase) root.dataset.phase = view.phase;
	if (label.textContent !== view.label) label.textContent = view.label;
	if (primary.textContent !== view.primary) primary.textContent = view.primary;
	if (secondary.textContent !== view.secondary) secondary.textContent = view.secondary;
}

// Tick just after each wall-clock second so the display flips on time.
function tick() {
	render();
	setTimeout(tick, 1000 - (live.now() % 1000) + 5);
}
tick();
