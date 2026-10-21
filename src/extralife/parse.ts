// Turn raw API JSON into the small shapes the widgets use. Anything malformed throws ParseError,
// so the poller keeps the last good value instead of showing NaN.

export interface Participant {
	id: number;
	name: string;
	raised: number;
	goal: number;
	numDonations: number;
	teamId: number | null;
	teamName: string | null;
	eventName: string | null;
}

export interface Team {
	id: number;
	name: string;
	raised: number;
	goal: number;
	numDonations: number;
	numParticipants: number;
	eventName: string | null;
}

export interface Donation {
	id: string;
	donorName: string | null; // null when the donor chose to be anonymous (the field is omitted)
	amount: number | null; // null when the donor hid the amount
	createdAt: string; // ISO-8601 UTC
	participantId: number | null; // null for donations made to the team itself
	recipientName: string | null;
	message: string | null;
	incentiveId: string | null;
	isRegFee: boolean;
}

export class ParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ParseError';
	}
}

type Raw = Record<string, unknown>;

function asObject(raw: unknown, what: string): Raw {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ParseError(`${what}: expected an object`);
	return raw as Raw;
}

function num(o: Raw, key: string, what: string): number {
	const v = o[key];
	if (typeof v !== 'number' || !Number.isFinite(v)) throw new ParseError(`${what}: "${key}" is not a number (${JSON.stringify(v)})`);
	return v;
}

function optNum(o: Raw, key: string): number | null {
	const v = o[key];
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(o: Raw, key: string, what: string): string {
	const v = o[key];
	if (typeof v !== 'string') throw new ParseError(`${what}: "${key}" is not a string`);
	return v;
}

function optStr(o: Raw, key: string): string | null {
	const v = o[key];
	return typeof v === 'string' && v.trim() !== '' ? v : null;
}

export function parseParticipant(raw: unknown): Participant {
	const o = asObject(raw, 'participant');
	return {
		id: num(o, 'participantID', 'participant'),
		name: str(o, 'displayName', 'participant'),
		raised: num(o, 'sumDonations', 'participant'),
		goal: optNum(o, 'fundraisingGoal') ?? 0,
		numDonations: optNum(o, 'numDonations') ?? 0,
		teamId: optNum(o, 'teamID'),
		teamName: optStr(o, 'teamName'),
		eventName: optStr(o, 'eventName'),
	};
}

export function parseTeam(raw: unknown): Team {
	const o = asObject(raw, 'team');
	return {
		id: num(o, 'teamID', 'team'),
		name: str(o, 'name', 'team'),
		raised: num(o, 'sumDonations', 'team'),
		goal: optNum(o, 'fundraisingGoal') ?? 0,
		numDonations: optNum(o, 'numDonations') ?? 0,
		numParticipants: optNum(o, 'numParticipants') ?? 0,
		eventName: optStr(o, 'eventName'),
	};
}

/** API dates look like "2026-10-18T22:36:29.937+0000" or "...Z"; normalize to ISO UTC. */
export function normalizeDate(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const ms = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseDonation(raw: unknown): Donation {
	const o = asObject(raw, 'donation');
	const id = str(o, 'donationID', 'donation');
	const createdAt = normalizeDate(o.createdDateUTC);
	if (!createdAt) throw new ParseError(`donation ${id}: bad createdDateUTC`);
	return {
		id,
		donorName: optStr(o, 'displayName'),
		amount: optNum(o, 'amount'),
		createdAt,
		participantId: optNum(o, 'participantID'),
		recipientName: optStr(o, 'recipientName'),
		message: optStr(o, 'message'),
		incentiveId: optStr(o, 'incentiveID'),
		isRegFee: o.isRegFee === true,
	};
}

/** Parse a donations array, newest first. Malformed items are skipped; a non-array throws. */
export function parseDonations(raw: unknown): Donation[] {
	if (!Array.isArray(raw)) throw new ParseError('donations: expected an array');
	const out: Donation[] = [];
	for (const item of raw) {
		try {
			out.push(parseDonation(item));
		} catch {
			// skip the bad record, keep the rest
		}
	}
	return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
