// @ts-check
// Shared by the participant-goal and team-goal widgets; <body data-source="participant|team"> picks the data.
import { formatDollars, progress } from './format.js';
import { connectLive, tween } from './live.js';

const source = document.body.dataset.source === 'team' ? 'team' : 'participant';
const root = /** @type {HTMLElement} */ (document.querySelector('.goal'));
const raisedEl = /** @type {HTMLElement} */ (root.querySelector('.raised'));
const goalEl = /** @type {HTMLElement} */ (root.querySelector('.goal-amount'));
const percentEl = /** @type {HTMLElement} */ (root.querySelector('.percent'));
const fillEl = /** @type {HTMLElement} */ (root.querySelector('.fill'));

/** @type {number | null} */
let shownRaised = null;
/** @type {number | null} */
let targetRaised = null;
let cancel = () => {};

connectLive((s) => {
	const data = s[source];
	if (!data) return; // nothing yet: keep the placeholder (never NaN)
	const { raised, goal } = data;
	goalEl.textContent = formatDollars(goal);

	const p = progress(raised, goal);
	fillEl.style.width = `${Math.min(1, p) * 100}%`;
	root.classList.toggle('met', p >= 1);
	percentEl.textContent = goal > 0 ? `${Math.floor(p * 100)}%` : '';

	if (raised === targetRaised) return;
	const from = shownRaised;
	targetRaised = raised;
	cancel();
	if (from === null) {
		// first render (or a reload on scene switch): show the value immediately
		shownRaised = raised;
		raisedEl.textContent = formatDollars(raised);
		return;
	}
	if (raised > from) {
		raisedEl.classList.remove('bump');
		void raisedEl.offsetWidth; // restart the animation
		raisedEl.classList.add('bump');
	}
	cancel = tween(from, raised, 1200, (v) => {
		shownRaised = v;
		raisedEl.textContent = formatDollars(v);
	});
});
