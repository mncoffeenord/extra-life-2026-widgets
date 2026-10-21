// @ts-check
// Stream clock, shared by the countdown widget (browser) and /api/countdown + tests (Node).
//
//   before start:  "Starts in"  2d 04h 12m   (or HH:MM:SS under 24 hours)
//   during:        "Live"       07:42  of 36:00   (elapsed, counting up)
//   after end:     "Overtime"   00:12            (counting up from the end time)

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * Hours:minutes with hours allowed past 24 (e.g. 36:00).
 * @param {number} ms non-negative
 */
export function formatHoursMinutes(ms) {
	const totalMinutes = Math.floor(ms / MINUTE);
	return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

/**
 * Time remaining before the start. Rounds up to the whole second so it reads 00:00:01, then flips to Live.
 * @param {number} ms positive
 */
export function formatRemaining(ms) {
	const totalSeconds = Math.ceil(ms / SECOND);
	if (totalSeconds * SECOND >= DAY) {
		const totalMinutes = Math.ceil(ms / MINUTE);
		const days = Math.floor(totalMinutes / (24 * 60));
		const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
		const minutes = totalMinutes % 60;
		return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
	}
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * @typedef {{ phase: 'before' | 'live' | 'overtime', label: string, primary: string, secondary: string }} ClockView
 */

/**
 * @param {number} nowMs
 * @param {number} startMs
 * @param {number} endMs
 * @returns {ClockView}
 */
export function clockView(nowMs, startMs, endMs) {
	if (!Number.isFinite(nowMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
		return { phase: 'before', label: 'Starts in', primary: '--:--:--', secondary: '' };
	}
	if (nowMs < startMs) {
		return { phase: 'before', label: 'Starts in', primary: formatRemaining(startMs - nowMs), secondary: '' };
	}
	if (nowMs < endMs) {
		return { phase: 'live', label: 'Live', primary: formatHoursMinutes(nowMs - startMs), secondary: `of ${formatHoursMinutes(endMs - startMs)}` };
	}
	return { phase: 'overtime', label: 'Overtime', primary: formatHoursMinutes(nowMs - endMs), secondary: '' };
}
