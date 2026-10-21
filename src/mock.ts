// A fake Extra Life API for /preview and offline testing. It serves raw API-shaped JSON from
// mutable state, so mock mode exercises the real poller, parsers, ETags, and outage handling.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FetchResult } from './extralife/client.ts';

type Raw = Record<string, unknown>;

function fixture(name: string): unknown {
	return JSON.parse(readFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8'));
}

export interface MockDonationInput {
	scope: 'mine' | 'team';
	donorName?: string | null;
	amount?: number | null;
}

export class MockApi {
	readonly participantId: number;
	participant: Raw;
	team: Raw;
	participantDonations: Raw[];
	teamDonations: Raw[];
	down = false;
	#seq = 0;
	#now: () => number;

	constructor(now: () => number = Date.now) {
		this.#now = now;
		this.participant = { ...(fixture('participant') as Raw), displayName: 'Streamer', sumDonations: 1250, fundraisingGoal: 2000, numDonations: 3 };
		this.team = { ...(fixture('team') as Raw) };
		this.participantId = this.participant.participantID as number;
		const teammates = (fixture('team-donations') as Raw[]).filter((d) => d.participantID !== this.participantId);
		// Fixture names are anonymized ("Person 2"); give the fake team readable donor and teammate names.
		const recipients = new Map<unknown, string>();
		const teammateNames = ['Sam', 'Jordan', 'Riley', 'Casey'];
		this.teamDonations = teammates.map((d, i) => {
			if (!recipients.has(d.participantID)) recipients.set(d.participantID, teammateNames[recipients.size % teammateNames.length]!);
			return { ...d, displayName: ['Alex P.', 'Aunt Bea', 'Jordan K.', 'Casey L.', 'Pat from work', 'Taylor B.', 'Morgan D.'][i % 7], recipientName: recipients.get(d.participantID) };
		});
		this.participantDonations = [];
		for (const [donorName, amount] of [['Grandma Jo', 50], [null, 25], ['Chris from work', 100]] as const) {
			this.addDonation({ scope: 'mine', donorName, amount }, { adjustTotals: false });
		}
	}

	addDonation(input: MockDonationInput, { adjustTotals = true } = {}): Raw {
		const id = `MOCK${String(++this.#seq).padStart(12, '0')}`;
		const mine = input.scope === 'mine';
		const recipientId = mine ? this.participantId : 900099;
		const donation: Raw = {
			donationID: id,
			participantID: recipientId,
			teamID: this.team.teamID,
			amount: input.amount === undefined ? 20 : input.amount,
			createdDateUTC: new Date(this.#now()).toISOString(),
			recipientName: mine ? this.participant.displayName : 'Jordan',
			isRegFee: false,
		};
		if (input.donorName !== null) donation.displayName = input.donorName ?? 'Friendly Donor';
		const amount = typeof donation.amount === 'number' ? donation.amount : 0;
		this.teamDonations.unshift(donation);
		if (adjustTotals) this.team = { ...this.team, sumDonations: (this.team.sumDonations as number) + amount, numDonations: (this.team.numDonations as number) + 1 };
		if (mine) {
			this.participantDonations.unshift(donation);
			if (adjustTotals) {
				this.participant = {
					...this.participant,
					sumDonations: (this.participant.sumDonations as number) + amount,
					numDonations: (this.participant.numDonations as number) + 1,
				};
			}
		}
		return donation;
	}

	setTotals(which: 'participant' | 'team', values: { raised?: number; goal?: number }): void {
		const current = which === 'participant' ? this.participant : this.team;
		const next = { ...current };
		if (typeof values.raised === 'number' && Number.isFinite(values.raised)) next.sumDonations = values.raised;
		if (typeof values.goal === 'number' && Number.isFinite(values.goal)) next.fundraisingGoal = values.goal;
		if (which === 'participant') this.participant = next;
		else this.team = next;
	}

	/** Same contract as ExtraLifeClient.get. */
	async get(path: string, etag: string | null = null): Promise<FetchResult> {
		if (this.down) return { kind: 'error', reason: 'network', status: null, retryAfterMs: null, message: 'mock outage' };
		const [route = '', query = ''] = path.split('?');
		const limit = Number(new URLSearchParams(query).get('limit') ?? 100);
		let data: unknown;
		if (/^participants\/[^/]+$/.test(route)) data = this.participant;
		else if (/^teams\/[^/]+$/.test(route)) data = this.team;
		else if (/^participants\/[^/]+\/donations$/.test(route)) data = this.participantDonations.slice(0, limit);
		else if (/^teams\/[^/]+\/donations$/.test(route)) data = this.teamDonations.slice(0, limit);
		else return { kind: 'error', reason: 'not-found', status: 404, retryAfterMs: null, message: `mock has no route for ${path}` };
		const tag = `"${createHash('sha1').update(JSON.stringify(data)).digest('hex')}"`;
		if (tag === etag) return { kind: 'not-modified', etag };
		return { kind: 'ok', data: structuredClone(data), etag: tag, numRecords: Array.isArray(data) ? data.length : null };
	}
}
