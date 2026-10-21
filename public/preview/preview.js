// @ts-check
// Preview of every widget at its exact Streamlabs position, plus mock-mode controls.
// It polls /api/health instead of opening its own event stream, which leaves browser connections free for the widgets.

/** Streamlabs browser sources on the 1920x1080 canvas. Keep in sync with the README table. */
const SOURCES = [
	{ name: 'Stream countdown', path: '/widgets/countdown', x: 23, y: 987, w: 488, h: 82 },
	{ name: 'My Extra Life goal', path: '/widgets/participant-goal', x: 533, y: 987, w: 488, h: 82 },
	{ name: 'GamePlan42 goal', path: '/widgets/team-goal', x: 1043, y: 987, w: 488, h: 82 },
	{ name: 'Donations received', path: '/widgets/donation-rotator', x: 1583, y: 325, w: 314, h: 58 },
];
/** Optional replacement for the Donations source: the version with messages, in a taller box (320 x 143). */
const MESSAGES_SOURCE = { name: 'Donations received (with messages)', path: '/widgets/donation-messages', x: 1583, y: 325, w: 314, h: 105 };
const MESSAGES_BOX = { x: 1580, y: 290, w: 320, h: 143, head: 32, font: 18, title: 'Donations received' };
/** Fallback boxes (outer geometry from the overlay generator). */
const BOXES = [
	{ x: 20, y: 944, w: 494, h: 128, head: 40, font: 22, title: 'Stream countdown' },
	{ x: 530, y: 944, w: 494, h: 128, head: 40, font: 22, title: 'My Extra Life goal' },
	{ x: 1040, y: 944, w: 494, h: 128, head: 40, font: 22, title: 'GamePlan42 goal' },
	{ x: 1580, y: 290, w: 320, h: 96, head: 32, font: 18, title: 'Donations received' },
];

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const stage = $('stage');
const wrap = $('stage-wrap');

// --- stage ---------------------------------------------------------------------
// ?donations=messages (or the header selector) swaps in the with-messages Donations widget and its taller box.
const params = new URLSearchParams(location.search);
const variantSelect = /** @type {HTMLSelectElement} */ ($('donations-variant'));
variantSelect.value = params.get('donations') === 'messages' ? 'messages' : 'standard';
const withMessages = variantSelect.value === 'messages';
variantSelect.addEventListener('change', () => {
	params.set('donations', variantSelect.value);
	location.search = params.toString();
});
const activeSources = withMessages ? [...SOURCES.slice(0, 3), MESSAGES_SOURCE] : SOURCES;
for (const s of activeSources) {
	const frame = document.createElement('iframe');
	frame.src = s.path;
	frame.title = s.name;
	Object.assign(frame.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
	stage.append(frame);
}
/** @param {{ x: number, y: number, w: number, h: number, head: number, font: number, title: string }} b @param {string} className */
function box(b, className) {
	const el = document.createElement('div');
	el.className = className;
	Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
	const head = document.createElement('div');
	head.className = 'fb-head';
	Object.assign(head.style, { height: `${b.head}px`, fontSize: `${b.font}px` });
	head.textContent = b.title;
	el.append(head);
	return el;
}

// Overlay art (git-ignored, in local-assets/): overlay-preview-messages.png has the taller Donations box. If it is
// missing, use overlay-preview.png and draw the taller box on top; if that is missing too, draw plain boxes.
const overlay = /** @type {HTMLImageElement} */ ($('overlay'));
let messagesArt = withMessages;
if (messagesArt) overlay.src = '/local-assets/overlay-preview-messages.png';
const drawMessagesBox = () => stage.append(box(MESSAGES_BOX, 'fb-box msg-box'));
overlay.addEventListener('error', () => {
	if (messagesArt) {
		messagesArt = false;
		overlay.src = '/local-assets/overlay-preview.png';
		drawMessagesBox();
		return;
	}
	overlay.remove();
	const fb = $('fallback');
	fb.hidden = false;
	fb.innerHTML = '<div class="fb-game">Game capture 1440×810</div><div class="fb-rule"></div>';
	for (const b of BOXES) {
		if (withMessages && b.title === 'Donations received') continue; // the taller box is drawn instead
		fb.append(box(b, 'fb-box'));
	}
	if (withMessages && !stage.querySelector('.msg-box')) drawMessagesBox();
});

// ?bare=1 shows only the 1920x1080 stage at 1:1 (for full-frame screenshots).
const bare = new URLSearchParams(location.search).has('bare');
document.body.classList.toggle('bare', bare);

function fit() {
	const scale = bare ? 1 : Math.min(1, wrap.clientWidth / 1920);
	stage.style.transform = `scale(${scale})`;
	wrap.style.height = `${1080 * scale}px`;
}
addEventListener('resize', fit);
fit();

const outline = /** @type {HTMLInputElement} */ ($('outline'));
outline.addEventListener('change', () => stage.classList.toggle('outline', outline.checked));

// --- source table ----------------------------------------------------------------
const sourceRows = /** @type {HTMLElement} */ (document.querySelector('#sources tbody'));
for (const s of [...SOURCES, MESSAGES_SOURCE]) {
	const tr = document.createElement('tr');
	for (const v of [s.name, `${location.origin}${s.path}`, s.x, s.y, s.w, s.h]) {
		const td = document.createElement('td');
		if (typeof v === 'string' && v.startsWith('http')) {
			const code = document.createElement('code');
			code.textContent = v;
			td.append(code);
		} else td.textContent = String(v);
		tr.append(td);
	}
	sourceRows.append(tr);
}

// --- health ----------------------------------------------------------------------
/** @type {{ startMs: number, endMs: number } | null} */
let event = null;
let outageOn = false;

async function refresh() {
	try {
		const h = await (await fetch('/api/health', { cache: 'no-store' })).json();
		const mode = $('mode');
		mode.textContent = h.mode === 'mock' ? 'Mock data' : 'Live data';
		mode.className = `pill ${h.mode}`;
		const health = $('health');
		health.textContent = h.ok ? 'API OK' : h.hasData ? 'API failing: showing cached data' : 'No data yet';
		health.className = `pill ${h.ok ? 'ok' : 'bad'}`;
		$('mock-panel').hidden = h.mode !== 'mock';
		$('live-panel').hidden = h.mode === 'mock';
		outageOn = h.mockApiDown;
		$('outage').textContent = outageOn ? 'End outage' : 'Simulate outage';
		$('outage').classList.toggle('on', outageOn);

		const rows = /** @type {HTMLElement} */ (document.querySelector('#status tbody'));
		rows.replaceChildren();
		for (const [key, r] of Object.entries(h.resources)) {
			const tr = document.createElement('tr');
			for (const v of [key, r.lastSuccessAgeSeconds === null ? 'never' : `${r.lastSuccessAgeSeconds}s ago`, r.consecutiveFailures, r.lastError ?? '']) {
				const td = document.createElement('td');
				td.textContent = String(v);
				tr.append(td);
			}
			rows.append(tr);
		}
		if (!event) event = (await (await fetch('/api/state')).json()).event;
	} catch {
		$('health').textContent = 'Server not reachable';
		$('health').className = 'pill bad';
	}
}
refresh();
setInterval(refresh, 2000);

// --- mock controls ------------------------------------------------------------------
/** @param {string} action @param {Record<string, unknown>} body */
async function mock(action, body) {
	await fetch(`/api/mock/${action}`, { method: 'POST', body: JSON.stringify(body) });
	refresh();
}

for (const form of document.querySelectorAll('#mock-panel form')) {
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		const f = /** @type {HTMLFormElement} */ (form);
		const data = Object.fromEntries(new FormData(f));
		const action = /** @type {string} */ (f.dataset.action);
		if (action === 'donation') {
			mock('donation', {
				scope: data.scope,
				donorName: String(data.donorName ?? '').trim() || null,
				amount: String(data.amount ?? '') === '' ? null : Number(data.amount),
				message: String(data.message ?? '').trim() || null,
			});
		} else {
			mock(action, { raised: data.raised === '' ? undefined : Number(data.raised), goal: data.goal === '' ? undefined : Number(data.goal) });
		}
	});
}

const DONORS = ['Aunt Bea', 'Coffee Club', 'Pat from work', 'Big Kahuna', 'Speedrunner42', 'Grandpa Lou'];
for (const b of document.querySelectorAll('[data-quick]')) {
	b.addEventListener('click', () => {
		const btn = /** @type {HTMLElement} */ (b);
		mock('donation', { scope: btn.dataset.quick, amount: Number(btn.dataset.amount), donorName: DONORS[Math.floor(Math.random() * DONORS.length)] });
	});
}

const M = 60_000;
const H = 60 * M;
for (const b of document.querySelectorAll('[data-clock]')) {
	b.addEventListener('click', () => {
		const which = /** @type {HTMLElement} */ (b).dataset.clock;
		if (!event || which === 'real') return mock('clock', {});
		const at = {
			'before-days': event.startMs - (2 * 24 * H + 4 * H + 12 * M),
			'before-10s': event.startMs - 10_000,
			live: event.startMs + 7 * H + 42 * M,
			'before-end': event.endMs - 10_000,
			overtime: event.endMs + 12 * M,
		}[/** @type {string} */ (which)];
		mock('clock', { at });
	});
}

$('outage').addEventListener('click', () => mock('outage', { down: !outageOn }));
