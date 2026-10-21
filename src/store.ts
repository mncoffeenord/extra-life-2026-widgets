// In-memory state shared by every widget, with last-known-good semantics and an on-disk copy
// so a server restart during the stream still has numbers to show if the API is down.

import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Donation, Participant, Team } from './extralife/parse.ts';

export type ResourceKey = 'participant' | 'team' | 'participantDonations' | 'teamDonations';
export const RESOURCE_KEYS: ResourceKey[] = ['participant', 'team', 'participantDonations', 'teamDonations'];

export interface ResourceStatus {
	lastSuccessAt: number | null;
	lastAttemptAt: number | null;
	lastError: string | null;
	consecutiveFailures: number;
}

export interface Data {
	participant: Participant | null;
	team: Team | null;
	donations: { participant: Donation[]; team: Donation[] };
}

interface Persisted {
	key: string;
	savedAt: number;
	data: Data;
	lastSuccessAt: Partial<Record<ResourceKey, number | null>>;
}

export class Store extends EventEmitter<{ change: [] }> {
	readonly data: Data = { participant: null, team: null, donations: { participant: [], team: [] } };
	readonly status: Record<ResourceKey, ResourceStatus>;
	version = 0;
	readonly #cacheFile: string | null;
	readonly #cacheKey: string;
	#saveTimer: NodeJS.Timeout | null = null;

	constructor(opts: { cacheFile?: string | null; cacheKey?: string } = {}) {
		super();
		this.#cacheFile = opts.cacheFile ?? null;
		this.#cacheKey = opts.cacheKey ?? '';
		this.status = Object.fromEntries(
			RESOURCE_KEYS.map((k) => [k, { lastSuccessAt: null, lastAttemptAt: null, lastError: null, consecutiveFailures: 0 }]),
		) as Record<ResourceKey, ResourceStatus>;
	}

	setParticipant(p: Participant): void {
		if (!sameJson(this.data.participant, p)) this.#changed(() => (this.data.participant = p));
	}

	setTeam(t: Team): void {
		if (!sameJson(this.data.team, t)) this.#changed(() => (this.data.team = t));
	}

	setDonations(scope: 'participant' | 'team', list: Donation[]): void {
		if (!sameJson(this.data.donations[scope], list)) this.#changed(() => (this.data.donations[scope] = list));
	}

	recordAttempt(key: ResourceKey, now: number, error: string | null): void {
		const s = this.status[key];
		s.lastAttemptAt = now;
		if (error === null) {
			s.lastSuccessAt = now;
			s.lastError = null;
			s.consecutiveFailures = 0;
		} else {
			s.lastError = error;
			s.consecutiveFailures += 1;
		}
	}

	/** Replace all data at once (mock controls). */
	replace(data: Partial<Data>): void {
		this.#changed(() => Object.assign(this.data, data));
	}

	#changed(mutate: () => void): void {
		mutate();
		this.version += 1;
		this.emit('change');
		this.#scheduleSave();
	}

	#scheduleSave(): void {
		if (!this.#cacheFile || this.#saveTimer) return;
		this.#saveTimer = setTimeout(() => {
			this.#saveTimer = null;
			this.save();
		}, 1000);
		this.#saveTimer.unref();
	}

	save(): void {
		if (!this.#cacheFile) return;
		const payload: Persisted = {
			key: this.#cacheKey,
			savedAt: Date.now(),
			data: this.data,
			lastSuccessAt: Object.fromEntries(RESOURCE_KEYS.map((k) => [k, this.status[k].lastSuccessAt])),
		};
		try {
			mkdirSync(dirname(this.#cacheFile), { recursive: true });
			const tmp = `${this.#cacheFile}.tmp`;
			writeFileSync(tmp, JSON.stringify(payload));
			renameSync(tmp, this.#cacheFile);
		} catch (err) {
			console.warn(`[store] could not write cache: ${(err as Error).message}`);
		}
	}

	/** Load the on-disk copy if it belongs to the same participant/team. Returns true if loaded. */
	load(): boolean {
		if (!this.#cacheFile) return false;
		try {
			const saved = JSON.parse(readFileSync(this.#cacheFile, 'utf8')) as Persisted;
			if (saved.key !== this.#cacheKey || typeof saved.data !== 'object') return false;
			Object.assign(this.data, saved.data);
			for (const k of RESOURCE_KEYS) this.status[k].lastSuccessAt = saved.lastSuccessAt?.[k] ?? null;
			this.version += 1;
			return true;
		} catch {
			return false;
		}
	}
}

function sameJson(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
