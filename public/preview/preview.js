// @ts-check
// Preview of every widget at its exact Streamlabs position, plus mock-mode controls.
// The layout comes from /api/display (src/sources.ts), so it always matches the server's config.
// It polls /api/health instead of opening its own event stream, which leaves browser connections free for the widgets.

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {{ id: string, name: string, title: string, box: Rect, body: Rect }} WidgetInfo */
/** @typedef {{ id: string, query: string, name: string, rect: Rect }} SceneInfo */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const stage = $('stage');
const wrap = $('stage-wrap');

const display = /** @type {{ style: string, donations: string, themeName: string, themes: string[], widgets: WidgetInfo[], scenes: SceneInfo[] }} */ (
	await (await fetch('/api/display', { cache: 'no-store' })).json()
);
const byId = /** @type {Record<string, WidgetInfo>} */ (Object.fromEntries(display.widgets.map((w) => [w.id, w])));

// --- stage ---------------------------------------------------------------------
// Header selectors (or ?style= / ?donations= / ?theme=) pick the style, Donations version and theme; defaults come from config.
const params = new URLSearchParams(location.search);
const styleSelect = /** @type {HTMLSelectElement} */ ($('style-variant'));
const variantSelect = /** @type {HTMLSelectElement} */ ($('donations-variant'));
const themeSelect = /** @type {HTMLSelectElement} */ ($('theme-variant'));
for (const name of display.themes) themeSelect.append(new Option(name === display.themeName ? `${name} (default)` : name, name));
themeSelect.value = display.themes.includes(params.get('theme') ?? '') ? /** @type {string} */ (params.get('theme')) : display.themeName;
styleSelect.value = ['framed', 'transparent'].includes(params.get('style') ?? '') ? /** @type {string} */ (params.get('style')) : display.style;
variantSelect.value = (params.get('donations') ?? display.donations) === 'messages' ? 'messages' : 'standard';
for (const [select, key] of /** @type {const} */ ([[styleSelect, 'style'], [variantSelect, 'donations'], [themeSelect, 'theme']])) {
	select.addEventListener('change', () => {
		params.set(key, select.value);
		location.search = params.toString();
	});
}
const framed = styleSelect.value === 'framed';
// Only the non-default theme goes in widget URLs, as in the source table.
const themeParam = themeSelect.value === display.themeName ? '' : `theme=${encodeURIComponent(themeSelect.value)}`;
const withMessages = variantSelect.value === 'messages';
const active = ['countdown', 'participant-goal', 'team-goal', withMessages ? 'donation-messages' : 'donation-rotator'].map((id) => /** @type {WidgetInfo} */ (byId[id]));
const rectOf = (/** @type {WidgetInfo} */ w) => (framed ? w.box : w.body);
const headOf = (/** @type {WidgetInfo} */ w) => w.box.h - w.body.h - 6;

for (const w of active) {
	const frame = document.createElement('iframe');
	frame.src = `/widgets/${w.id}?style=${framed ? 'framed' : 'transparent'}${themeParam ? `&${themeParam}` : ''}`;
	frame.title = w.name;
	const r = rectOf(w);
	Object.assign(frame.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
	stage.append(frame);
}

/** A plain overlay box (border, header) like the overlay art draws. @param {WidgetInfo} w @param {string} className */
function box(w, className) {
	const el = document.createElement('div');
	el.className = className;
	Object.assign(el.style, { left: `${w.box.x}px`, top: `${w.box.y}px`, width: `${w.box.w}px`, height: `${w.box.h}px` });
	const head = document.createElement('div');
	head.className = 'fb-head';
	Object.assign(head.style, { height: `${headOf(w)}px`, fontSize: `${headOf(w) >= 40 ? 22 : 18}px` });
	head.textContent = w.title;
	el.append(head);
	return el;
}

// Overlay art (git-ignored, in local-assets/): overlay-preview-messages.png has the taller Donations box. If it is
// missing, use overlay-preview.png and (transparent style) draw the taller box on top; if that is missing too, draw
// plain boxes. Framed widgets draw their own boxes, so they need none.
const overlay = /** @type {HTMLImageElement} */ ($('overlay'));
let messagesArt = withMessages;
if (messagesArt) overlay.src = '/local-assets/overlay-preview-messages.png';
const messagesBox = () => {
	if (!framed && !stage.querySelector('.msg-box')) stage.append(box(/** @type {WidgetInfo} */ (byId['donation-messages']), 'fb-box msg-box'));
};
overlay.addEventListener('error', () => {
	if (messagesArt) {
		messagesArt = false;
		overlay.src = '/local-assets/overlay-preview.png';
		messagesBox();
		return;
	}
	overlay.remove();
	const fb = $('fallback');
	fb.hidden = false;
	fb.innerHTML = '<div class="fb-game">Game capture 1440×810</div><div class="fb-rule"></div>';
	if (!framed) for (const w of active) if (w.id !== 'donation-messages') fb.append(box(w, 'fb-box'));
	if (withMessages) messagesBox();
});

// ?bare=1 shows only the 1920x1080 stage at 1:1 (for full-frame screenshots).
const bare = params.has('bare');
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

// --- source table (for the selected style) ----------------------------------------
$('sources-style').textContent = framed ? 'framed' : 'transparent';
const sourceRows = /** @type {HTMLElement} */ (document.querySelector('#sources tbody'));
/** @param {string} name @param {string} url @param {Rect} r */
function addSourceRow(name, url, r) {
	const tr = document.createElement('tr');
	for (const v of [name, url, r.x, r.y, r.w, r.h]) {
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
for (const w of display.widgets) {
	const style = framed ? 'framed' : 'transparent';
	const query = [style === display.style ? '' : `style=${style}`, themeParam].filter(Boolean).join('&');
	addSourceRow(w.name, `${location.origin}/widgets/${w.id}${query ? `?${query}` : ''}`, rectOf(w));
}
// Scenes are full-screen and keep their own colors, so no ?style= or ?theme=.
for (const s of display.scenes ?? []) addSourceRow(s.name, `${location.origin}/scenes/${s.id}${s.query ? `?${s.query}` : ''}`, s.rect);

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
