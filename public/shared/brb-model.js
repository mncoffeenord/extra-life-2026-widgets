// @ts-check
// Be Right Back scene: turns a /api/state snapshot into what the scene draws. Pure: no DOM.
import { donorLabel, formatAmount, formatDollars } from './format.js';
import { normalizePixelText } from './pixel-font.js';

/** @typedef {import('./live.js').Snapshot} Snapshot */
/** @typedef {import('./live.js').Donation} Donation */
/** @typedef {import('./live.js').Goal} Goal */

export const TEAM_HEARTS = 10;
/** The team hearts fill in halves. */
export const TEAM_HALVES = TEAM_HEARTS * 2;
export const MY_SEGMENTS = 40;
export const NO_DONATIONS_TEXT = 'BE THE FIRST!';

/** The design's mock data (?mock=1). */
export const MOCK_VIEW = /** @type {BrbView} */ ({
	header: { word: 'GAMEPLAN', number: '42' },
	latest: { id: 'mock', name: 'SAM K.', amount: 25 },
	team: { text: '$3,250 / $5,000', filled: 13 },
	mine: { text: '$1,250 / $2,000', filled: 25 },
});

/**
 * @typedef {{ id: string, name: string, amount: number | null }} LatestView
 * @typedef {{ text: string, filled: number }} GoalView `filled` counts half hearts (team) or segments (mine)
 * @typedef {{ header: { word: string, number: string } | null, latest: LatestView | null | undefined,
 *   team: GoalView | null, mine: GoalView | null }} BrbView
 * `latest` is null when there are no donations yet, undefined when donations have not loaded.
 */

/**
 * How many of `slots` to light: floor(slots * raised / goal), never rounded up. One is always lit (even at $0 or
 * with no goal), and all of them only at 100% or more (owner, 2026-10-22).
 * @param {unknown} raised
 * @param {unknown} goal
 * @param {number} slots
 */
export function meterSlots(raised, goal, slots) {
	if (typeof raised !== 'number' || typeof goal !== 'number' || !Number.isFinite(raised) || !Number.isFinite(goal) || goal <= 0) return 1;
	if (raised >= goal) return slots;
	// multiply first and allow for float error, so 3 of 10 stays 3 (not 2.9999); below the goal, never all
	return Math.max(1, Math.min(slots - 1, Math.floor((slots * raised) / goal + 1e-9)));
}

const MINUTE = 60_000;
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * Header clock: before the start it counts down, as DD:HH:MM "UNTIL GAME DAY" when more than 48 hours away, else
 * HH:MM (rounded up to the minute, so it never reads 00:00 early). From the published start it counts up as
 * "GAME TIME" HH:MM (hours go past 24), with no end time (owner, 2026-10-22/23). `before`/`after` are the labels on
 * each side of the time. Null without a valid start.
 * @param {number} nowMs
 * @param {number} startMs
 * @returns {{ time: string, before: string, after: string } | null}
 */
export function sceneClock(nowMs, startMs) {
	if (!Number.isFinite(nowMs) || !Number.isFinite(startMs)) return null;
	if (nowMs < startMs) {
		const ms = startMs - nowMs;
		const minutes = Math.ceil(ms / MINUTE);
		const hm = `${pad(Math.floor((minutes % 1440) / 60))}:${pad(minutes % 60)}`;
		const time = ms > 48 * 60 * MINUTE ? `${pad(Math.floor(minutes / 1440))}:${hm}` : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
		return { time, before: '', after: 'UNTIL GAME DAY' };
	}
	const minutes = Math.floor((nowMs - startMs) / MINUTE);
	return { time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, before: 'GAME TIME', after: '' };
}

/**
 * "$3,250 / $5,000", or just the raised amount when there is no goal.
 * @param {Goal} g
 */
export function goalText(g) {
	return g.goal > 0 ? `${formatDollars(g.raised)} / ${formatDollars(g.goal)}` : formatDollars(g.raised);
}

/**
 * Split a team name for the header at the first digit: "GamePlan42" -> GAMEPLAN + 42.
 * @param {string} name
 */
export function splitTeamName(name) {
	const text = normalizePixelText(name);
	const i = text.search(/[0-9]/);
	return i <= 0 ? { word: text, number: '' } : { word: text.slice(0, i).trimEnd(), number: text.slice(i) };
}

/**
 * The newest donation across my page and the team (deduplicated by id).
 * @param {{ participant: Donation[], team: Donation[] }} donations
 * @returns {Donation | null}
 */
export function latestDonation(donations) {
	/** @type {Donation | null} */
	let best = null;
	let bestAt = -Infinity;
	for (const d of [...(donations.participant ?? []), ...(donations.team ?? [])]) {
		const at = Date.parse(d.createdAt);
		if (best === null || (Number.isFinite(at) && at > bestAt)) {
			best = d;
			bestAt = Number.isFinite(at) ? at : bestAt;
		}
	}
	return best;
}

/**
 * Pixel-ready amount: "$25", "$25.50". Hidden amounts are not shown.
 * @param {number | null} amount
 */
export function amountText(amount) {
	return typeof amount === 'number' && Number.isFinite(amount) ? normalizePixelText(formatAmount(amount)) : '';
}

/**
 * @param {Snapshot} s
 * @returns {BrbView}
 */
export function brbView(s) {
	const d = latestDonation(s.donations ?? { participant: [], team: [] });
	// "none yet" only when the totals say so; empty lists alone may just not be loaded yet
	const noneYet = (s.team ?? s.participant) !== null && (s.team?.numDonations ?? 0) + (s.participant?.numDonations ?? 0) === 0;
	return {
		header: s.team?.name ? splitTeamName(s.team.name) : null,
		latest: d
			? { id: d.id, name: normalizePixelText(donorLabel(d, s.rotation.unknownDonorName)), amount: d.amount }
			: noneYet ? null : undefined,
		team: s.team ? { text: goalText(s.team), filled: meterSlots(s.team.raised, s.team.goal, TEAM_HALVES) } : null,
		mine: s.participant ? { text: goalText(s.participant), filled: meterSlots(s.participant.raised, s.participant.goal, MY_SEGMENTS) } : null,
	};
}
