// One shared poller for every API resource. Requests run one at a time with a minimum gap,
// use ETags so unchanged data costs a cheap 304, and back off exponentially on failure.

import { setTimeout as sleep } from 'node:timers/promises';
import type { ExtraLifeClient } from './extralife/client.ts';
import type { ResourceKey, Store } from './store.ts';

export interface Resource {
	key: ResourceKey;
	path: string;
	intervalMs: number;
	/** Parse and store a 200 response. Throwing (e.g. ParseError) counts as a failure. */
	apply(data: unknown): void;
}

export interface PollerOptions {
	client: Pick<ExtraLifeClient, 'get'>;
	store: Store;
	resources: Resource[];
	minGapMs: number;
	maxBackoffMs: number;
	now?: () => number;
	random?: () => number;
	log?: (message: string) => void;
}

interface State {
	resource: Resource;
	nextDueAt: number;
	etag: string | null;
}

export class Poller {
	readonly #opts: Required<PollerOptions>;
	readonly #states = new Map<ResourceKey, State>();
	#lastRequestAt = Number.NEGATIVE_INFINITY;
	#abort: AbortController | null = null;
	#wake: (() => void) | null = null;

	constructor(opts: PollerOptions) {
		this.#opts = { now: Date.now, random: Math.random, log: (m) => console.log(m), ...opts };
		const now = this.#opts.now();
		for (const resource of opts.resources) this.#states.set(resource.key, { resource, nextDueAt: now, etag: null });
	}

	/** Make a resource due now (e.g. fetch donations as soon as the total changes). */
	trigger(key: ResourceKey): void {
		const s = this.#states.get(key);
		if (!s) return;
		s.nextDueAt = Math.min(s.nextDueAt, this.#opts.now());
		this.#wake?.();
	}

	nextDueAt(key: ResourceKey): number | undefined {
		return this.#states.get(key)?.nextDueAt;
	}

	/** The resource that should run next and how long to wait before running it. */
	plan(): { key: ResourceKey; waitMs: number } | null {
		let best: State | null = null;
		for (const s of this.#states.values()) if (!best || s.nextDueAt < best.nextDueAt) best = s;
		if (!best) return null;
		const now = this.#opts.now();
		const earliest = Math.max(best.nextDueAt, this.#lastRequestAt + this.#opts.minGapMs);
		return { key: best.resource.key, waitMs: Math.max(0, earliest - now) };
	}

	/** Perform one request for `key` and schedule its next run. */
	async poll(key: ResourceKey): Promise<void> {
		const s = this.#states.get(key);
		if (!s) return;
		const { resource } = s;
		const { store, now } = this.#opts;
		this.#lastRequestAt = now();
		const result = await this.#opts.client.get(resource.path, s.etag);
		const done = now();

		if (result.kind === 'error') {
			store.recordAttempt(key, done, `${result.reason}: ${result.message}`);
			const failures = store.status[key].consecutiveFailures;
			const backoff = Math.min(this.#opts.maxBackoffMs, resource.intervalMs * 2 ** failures);
			const jittered = backoff * (0.8 + 0.4 * this.#opts.random());
			s.nextDueAt = done + Math.max(jittered, result.retryAfterMs ?? 0);
			this.#opts.log(`[poll] ${key} failed (${failures}x): ${result.reason} ${result.message}; retry in ${Math.round((s.nextDueAt - done) / 1000)}s`);
			return;
		}

		if (result.kind === 'ok') {
			try {
				resource.apply(result.data);
			} catch (err) {
				store.recordAttempt(key, done, `parse: ${(err as Error).message}`);
				s.etag = null; // don't let a 304 pin us to a payload we could not use
				s.nextDueAt = done + resource.intervalMs;
				this.#opts.log(`[poll] ${key} unusable response: ${(err as Error).message}`);
				return;
			}
		}
		s.etag = result.etag ?? s.etag;
		store.recordAttempt(key, done, null);
		s.nextDueAt = done + resource.intervalMs;
	}

	start(): void {
		if (this.#abort) return;
		const abort = (this.#abort = new AbortController());
		void (async () => {
			while (!abort.signal.aborted) {
				const next = this.plan();
				if (!next) return;
				if (next.waitMs > 0) {
					const woke = new Promise<void>((resolve) => (this.#wake = resolve));
					await Promise.race([sleep(next.waitMs, undefined, { signal: abort.signal }).catch(() => {}), woke]);
					this.#wake = null;
					continue; // re-plan: a trigger may have changed what is due
				}
				await this.poll(next.key).catch((err) => this.#opts.log(`[poll] ${next.key} crashed: ${(err as Error).message}`));
			}
		})();
	}

	stop(): void {
		this.#abort?.abort();
		this.#abort = null;
		this.#wake?.();
	}
}
