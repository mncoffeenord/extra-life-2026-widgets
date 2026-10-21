// Time-zone helpers built on Intl, so no tz database dependency is needed.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let f = formatterCache.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		formatterCache.set(timeZone, f);
	}
	return f;
}

export interface WallTime {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	second: number;
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		formatterFor(timeZone);
		return true;
	} catch {
		return false;
	}
}

/** Wall-clock fields for an instant as seen in `timeZone`. */
export function wallTimeIn(utcMs: number, timeZone: string): WallTime {
	const parts: Record<string, number> = {};
	for (const p of formatterFor(timeZone).formatToParts(new Date(utcMs))) {
		if (p.type !== 'literal') parts[p.type] = Number(p.value);
	}
	return {
		year: parts.year ?? 0,
		month: parts.month ?? 0,
		day: parts.day ?? 0,
		hour: parts.hour ?? 0,
		minute: parts.minute ?? 0,
		second: parts.second ?? 0,
	};
}

/** Offset of `timeZone` from UTC at the given instant, in ms (Chicago in November: -6h). */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
	const w = wallTimeIn(utcMs, timeZone);
	const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
	return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC instant.
 * Ambiguous times (the repeated hour when DST ends) resolve to the earlier instant.
 * Non-existent times (the skipped hour when DST starts) throw.
 */
export function zonedWallTimeToUtc(w: WallTime, timeZone: string): number {
	const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
	// The offsets in effect 14h either side cover any single DST transition near this wall time.
	const offsets = new Set([zoneOffsetMs(guess - 14 * 3_600_000, timeZone), zoneOffsetMs(guess + 14 * 3_600_000, timeZone)]);
	const candidates = [...offsets]
		.map((offset) => guess - offset)
		.filter((t) => sameWall(wallTimeIn(t, timeZone), w))
		.sort((a, b) => a - b);
	if (candidates.length === 0) {
		throw new RangeError(`${formatWall(w)} does not exist in ${timeZone} (skipped by a DST change)`);
	}
	return candidates[0]!;
}

function sameWall(a: WallTime, b: WallTime): boolean {
	return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

function formatWall(w: WallTime): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}:${p(w.second)}`;
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const HAS_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse an event time from config. "2026-11-12T13:00" is a wall time in `timeZone`;
 * a string ending in Z or an explicit offset is taken as an exact instant.
 */
export function parseEventTime(value: string, timeZone: string): number {
	const trimmed = value.trim();
	if (HAS_OFFSET_RE.test(trimmed)) {
		const ms = Date.parse(trimmed);
		if (Number.isNaN(ms)) throw new RangeError(`Unparseable date-time "${value}"`);
		return ms;
	}
	const m = WALL_RE.exec(trimmed);
	if (!m) throw new RangeError(`Expected "YYYY-MM-DDTHH:mm" (local to ${timeZone}), got "${value}"`);
	const [, y, mo, d, h, mi, s] = m;
	const w: WallTime = { year: +y!, month: +mo!, day: +d!, hour: +h!, minute: +mi!, second: s ? +s : 0 };
	if (w.month < 1 || w.month > 12 || w.day < 1 || w.day > 31 || w.hour > 23 || w.minute > 59 || w.second > 59) {
		throw new RangeError(`Out-of-range date-time "${value}"`);
	}
	return zonedWallTimeToUtc(w, timeZone);
}
