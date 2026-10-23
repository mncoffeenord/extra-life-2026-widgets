// @ts-check
// Connects a widget or scene to the local server, by server-sent events (instant) or by polling /api/state every
// 3 s. Widgets default to events; full-screen scenes default to polling, because Streamlabs' browser sources share
// about 6 open connections per server and a break screen doesn't need instant updates. ?transport=poll or
// ?transport=sse on a URL overrides the default.
// The server's clock is tracked so every widget agrees on the countdown (and follows mock time travel).

/**
 * @typedef {{ id: string, donorName: string | null, amount: number | null, createdAt: string,
 *   participantId: number | null, recipientName: string | null, message: string | null }} Donation
 * @typedef {{ name: string, raised: number, goal: number, numDonations: number }} Goal
 * @typedef {{
 *   version: number, serverNow: number, mode: 'live' | 'mock',
 *   event: { startMs: number, endMs: number, timeZone: string },
 *   participant: (Goal & { id: number }) | null, team: Goal | null,
 *   donations: { participant: Donation[], team: Donation[] },
 *   ownParticipantId: number | null,
 *   rotation: { intervalMs: number, unknownDonorName: string, privateAmountText: string }
 * }} Snapshot
 */

/**
 * @param {(snapshot: Snapshot) => void} onSnapshot
 * @param {{ transport?: 'sse' | 'poll' }} [options] the default transport (scenes pass 'poll')
 * @returns {{ now: () => number }}
 */
export function connectLive(onSnapshot, { transport: defaultTransport = 'sse' } = {}) {
	let offsetMs = 0;

	// Widgets must treat repeated snapshots as no-ops (polling resends the same state).
	/** @param {Snapshot} s */
	const handle = (s) => {
		offsetMs = s.serverNow - Date.now();
		onSnapshot(s);
	};

	const pollState = async () => {
		try {
			const res = await fetch('/api/state', { cache: 'no-store' });
			if (res.ok) handle(await res.json());
		} catch {
			// server unreachable: keep showing what we have
		}
	};

	const requested = new URLSearchParams(location.search).get('transport');
	const transport = requested === 'poll' || requested === 'sse' ? requested : defaultTransport;
	if (transport === 'poll' || typeof EventSource === 'undefined') {
		void pollState();
		setInterval(pollState, 3000);
	} else {
		const es = new EventSource('/api/stream');
		es.addEventListener('snapshot', (e) => handle(JSON.parse(/** @type {MessageEvent} */ (e).data)));
		// EventSource reconnects by itself; while it is down, poll so a reload still gets data.
		setInterval(() => {
			if (es.readyState !== EventSource.OPEN) void pollState();
		}, 5000);
	}
	return { now: () => Date.now() + offsetMs };
}

/**
 * Animate a number from `from` to `to`, calling `render` each frame. Returns a cancel function.
 * @param {number} from
 * @param {number} to
 * @param {number} durationMs
 * @param {(value: number) => void} render
 */
export function tween(from, to, durationMs, render) {
	if (from === to || durationMs <= 0 || document.hidden) {
		render(to);
		return () => {};
	}
	const start = performance.now();
	let frame = 0;
	const step = (/** @type {number} */ t) => {
		// a frame's timestamp can be a little before `start`; clamp so the value never runs below `from`
		const p = Math.min(1, Math.max(0, (t - start) / durationMs));
		const eased = 1 - (1 - p) ** 3;
		render(from + (to - from) * eased);
		if (p < 1) frame = requestAnimationFrame(step);
	};
	frame = requestAnimationFrame(step);
	// If frames are throttled (hidden source), make sure we still land on the final value.
	const fallback = setTimeout(() => render(to), durationMs + 250);
	return () => {
		cancelAnimationFrame(frame);
		clearTimeout(fallback);
	};
}
