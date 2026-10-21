// Thin HTTP client for the DonorDrive (Extra Life) public API.
// It never throws: every outcome comes back as a FetchResult so the poller can decide what to do.

export type FetchErrorReason = 'not-found' | 'rate-limited' | 'http' | 'network' | 'timeout' | 'bad-response';

export type FetchResult =
	| { kind: 'ok'; data: unknown; etag: string | null; numRecords: number | null }
	| { kind: 'not-modified'; etag: string | null }
	| { kind: 'error'; reason: FetchErrorReason; status: number | null; retryAfterMs: number | null; message: string };

export interface ClientOptions {
	baseUrl: string;
	apiVersion: string;
	timeoutMs: number;
	fetch?: typeof fetch;
	now?: () => number;
}

export const USER_AGENT = 'extra-life-2026-widgets (+https://github.com/mncoffeenord/extra-life-2026-widgets)';

export class ExtraLifeClient {
	readonly #opts: Required<ClientOptions>;

	constructor(opts: ClientOptions) {
		this.#opts = { fetch: globalThis.fetch.bind(globalThis), now: Date.now, ...opts };
	}

	url(path: string): string {
		const u = new URL(`${this.#opts.baseUrl}/${path.replace(/^\/+/, '')}`);
		u.searchParams.set('version', this.#opts.apiVersion);
		return u.toString();
	}

	async get(path: string, etag: string | null = null): Promise<FetchResult> {
		const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
		if (etag) headers['If-None-Match'] = etag;

		let res: Response;
		try {
			res = await this.#opts.fetch(this.url(path), {
				headers,
				signal: AbortSignal.timeout(this.#opts.timeoutMs),
				redirect: 'follow',
			});
		} catch (err) {
			const e = err as Error;
			const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
			return error(timeout ? 'timeout' : 'network', null, timeout ? `timed out after ${this.#opts.timeoutMs}ms` : e.message);
		}

		const responseEtag = res.headers.get('etag');
		if (res.status === 304) return { kind: 'not-modified', etag: responseEtag ?? etag };

		const body = await res.text().catch(() => '');
		if (res.status === 429 || (res.status === 401 && /rate limit/i.test(body))) {
			return error('rate-limited', res.status, body.trim() || 'rate limited', parseRetryAfter(res.headers.get('retry-after'), this.#opts.now()));
		}
		if (res.status === 404) return error('not-found', 404, 'not found (check the participant / team ID)');
		if (!res.ok) return error('http', res.status, `HTTP ${res.status}${body ? `: ${body.trim().slice(0, 120)}` : ''}`);

		const contentType = res.headers.get('content-type') ?? '';
		if (!contentType.includes('json')) return error('bad-response', res.status, `expected JSON, got "${contentType}"`);
		try {
			const numRecords = res.headers.get('num-records');
			return { kind: 'ok', data: JSON.parse(body), etag: responseEtag, numRecords: numRecords === null ? null : Number(numRecords) };
		} catch {
			return error('bad-response', res.status, 'response body is not valid JSON');
		}
	}
}

function error(reason: FetchErrorReason, status: number | null, message: string, retryAfterMs: number | null = null): FetchResult {
	return { kind: 'error', reason, status, retryAfterMs, message };
}

/** Retry-After is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number): number | null {
	if (!value) return null;
	if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
	const at = Date.parse(value);
	return Number.isNaN(at) ? null : Math.max(0, at - now);
}
